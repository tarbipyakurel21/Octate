"""Persistence for the vendored CVAT canvas setup() contract.

The TypeScript in vendor/cvat is a browser renderer. It does not talk to a
server. Both Canvas.setup and Canvas3d.setup take:

    frameData.number, frameData.deleted, frameData.width, frameData.height
    frameData.data() -> Promise

and an objectStates array.

2D frameData.data() must resolve to { renderWidth, renderHeight, imageData },
where imageData can be drawn with CanvasRenderingContext2D.drawImage. This
API returns the JPEG URL the browser fetches to build that object.

3D frameData.data() must resolve to { imageData: Blob }. Canvas3D reads that
blob as a PCD point cloud (position, then rotation, then scale):

    points[0:3] position, points[3:6] rotation, points[6:9] scale

2D points follow the same canvas:
    rectangle, ellipse: 4 numbers
    polygon: at least 3 points (6 numbers)
    polyline: at least 2 points
    points: at least 1 point
    cuboid: 16 numbers
    mask: RLE counts followed by left, top, right, bottom
"""

from __future__ import annotations

import json
import math
import os
import zlib
from pathlib import Path
from urllib.parse import urlparse

class CanvasError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status

SCHEMA = '''
CREATE TABLE IF NOT EXISTS canvas_frames (
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    frame INTEGER NOT NULL,
    deleted INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    states TEXT NOT NULL,
    issues TEXT NOT NULL,
    PRIMARY KEY (project_id, kind, frame)
);
'''

EVEN_SHAPES = {'polygon': 6, 'polyline': 4, 'points': 2}
FIXED_SHAPES = {'rectangle': 4, 'ellipse': 4, 'cuboid': 16}


def data_root() -> Path:
    root = Path(__file__).resolve().parents[1]
    return Path(os.getenv('OCTATE_DATA', root / 'data' / 'runtime'))


def ensure(db) -> None:
    db.executescript(SCHEMA)


ensure_schema = ensure


def seed_demo(db) -> None:
    if not db.execute("SELECT 1 FROM projects WHERE id='demo'").fetchone():
        return
    if db.execute("SELECT 1 FROM canvas_frames WHERE project_id='demo' AND kind='2d' AND frame=42").fetchone():
        return
    states = [
        _state_2d({
            'clientID': 1,
            'shapeType': 'rectangle',
            'label': 'Grasper',
            'points': [294, 194, 627, 446],
            'rotation': 0,
        }, 42),
        _state_2d({
            'clientID': 2,
            'shapeType': 'polygon',
            'label': 'Dissector',
            'points': [742, 151, 973, 288, 896, 490, 704, 389],
        }, 42),
    ]
    cuboid = [_state_3d({
        'clientID': 1,
        'label': 'Instrument',
        'points': [0, 0, 0, 0, 0, 0, 1, 0.4, 0.4],
    }, 42)]
    db.execute(
        'INSERT INTO canvas_frames VALUES (?,?,?,?,?,?,?,?)',
        ('demo', '2d', 42, 0, 1280, 720, json.dumps(states), '{}'),
    )
    db.execute(
        'INSERT INTO canvas_frames VALUES (?,?,?,?,?,?,?,?)',
        ('demo', '3d', 42, 0, 0, 0, json.dumps(cuboid), '{}'),
    )


def dispatch_get(db, data_root: Path, parts: list[str]):
    parsed = _route(parts)
    if parsed is None:
        return None
    project_id, kind, frame, cloud = parsed
    row = _project(db, project_id)
    if cloud:
        path = _cloud_path(data_root, project_id, frame)
        if not path.is_file():
            raise CanvasError('point cloud not found', 404)
        return ('file', path, 'application/octet-stream')
    return (200, _scene(db, data_root, row, kind, frame))


def put_scene(db, data_root: Path, parts: list[str], body: dict):
    parsed = _route(parts)
    if parsed is None or parsed[3]:
        return None
    project_id, kind, frame, _cloud = parsed
    row = _project(db, project_id)
    if not isinstance(body, dict):
        raise CanvasError('scene body must be an object')
    unknown = set(body) - {'deleted', 'objectStates', 'issueRegions', 'width', 'height'}
    if unknown:
        raise CanvasError(f'unknown scene fields: {", ".join(sorted(unknown))}')
    if kind == '3d' and 'issueRegions' in body:
        raise CanvasError('issueRegions belong to the 2D canvas')
    deleted = bool(body.get('deleted', False))
    raw_states = body.get('objectStates', [])
    if not isinstance(raw_states, list):
        raise CanvasError('objectStates must be a list')
    states = [_state_2d(item, frame) if kind == '2d' else _state_3d(item, frame) for item in raw_states]
    _unique_ids(states)
    issues = _issues(body.get('issueRegions', {})) if kind == '2d' else {}
    width, height = _dimensions(data_root, row, kind, frame, body)
    db.execute(
        'INSERT OR REPLACE INTO canvas_frames VALUES (?,?,?,?,?,?,?,?)',
        (project_id, kind, frame, int(deleted), width, height, json.dumps(states), json.dumps(issues)),
    )
    db.commit()
    return (200, _scene(db, data_root, row, kind, frame))


def put_cloud(db, data_root: Path, parts: list[str], raw: bytes):
    parsed = _route(parts)
    if parsed is None or not parsed[3]:
        return None
    project_id, _kind, frame, _cloud = parsed
    row = _project(db, project_id)
    if not raw.startswith(b'# .PCD'):
        raise CanvasError('point cloud must be a PCD file')
    if len(raw) > 200 * 1024 * 1024:
        raise CanvasError('point cloud exceeds 200MB')
    path = _cloud_path(data_root, project_id, frame)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    width, height = _pcd_size(raw)
    current = db.execute(
        'SELECT states, deleted FROM canvas_frames WHERE project_id=? AND kind=? AND frame=?',
        (project_id, '3d', frame),
    ).fetchone()
    states = current['states'] if current else '[]'
    deleted = current['deleted'] if current else 0
    db.execute(
        'INSERT OR REPLACE INTO canvas_frames VALUES (?,?,?,?,?,?,?,?)',
        (project_id, '3d', frame, deleted, width, height, states, '{}'),
    )
    db.commit()
    return (200, _scene(db, data_root, row, '3d', frame))


def _route(parts: list[str]):
    # /api/canvas/2d/{project}/frames/{frame}
    # /api/canvas/3d/{project}/frames/{frame}/cloud
    if len(parts) < 6 or parts[:2] != ['api', 'canvas'] or parts[2] not in {'2d', '3d'} or parts[4] != 'frames':
        return None
    kind = parts[2]
    try:
        frame = int(parts[5])
    except ValueError as exc:
        raise CanvasError('invalid frame') from exc
    if frame < 0:
        raise CanvasError('invalid frame')
    if len(parts) == 6:
        return parts[3], kind, frame, False
    if len(parts) == 7 and parts[6] == 'cloud' and kind == '3d':
        return parts[3], kind, frame, True
    return None


def handle_get(handler, db) -> None:
    _handle(handler, db, write=False)


def handle_put(handler, db) -> None:
    _handle(handler, db, write=True)


def _handle(handler, db, write: bool) -> None:
    parts = urlparse(handler.path).path.strip('/').split('/')
    try:
        if not write:
            hit = dispatch_get(db, data_root(), parts)
        elif parts[-1:] == ['cloud']:
            raw = handler.rfile.read(int(handler.headers.get('Content-Length', '0')))
            hit = put_cloud(db, data_root(), parts, raw)
        else:
            raw = handler.rfile.read(int(handler.headers.get('Content-Length', '0')))
            hit = put_scene(db, data_root(), parts, json.loads(raw or b'{}'))
        if hit is None:
            handler.send_json({'error': 'not found'}, 404)
            return
        if hit[0] == 'file':
            payload = hit[1].read_bytes()
            handler.send_response(200)
            handler.send_header('Content-Type', hit[2])
            handler.send_header('Content-Length', str(len(payload)))
            handler.send_header('Access-Control-Allow-Origin', '*')
            handler.end_headers()
            handler.wfile.write(payload)
            return
        handler.send_json(hit[1], hit[0])
    except CanvasError as exc:
        handler.send_json({'error': str(exc)}, exc.status)
    except json.JSONDecodeError:
        handler.send_json({'error': 'invalid JSON'}, 400)


def mirror_annotations(db, project_id: str, annotations: list) -> None:
    """Project the product annotation list into 2D canvas states.

    Rectangle and polygon points are flattened the same way CvatCanvasAdapter
    does. 3D cuboids and issue regions are left untouched. This does not commit;
    the product save owns the transaction.
    """
    if not isinstance(annotations, list):
        return
    grouped: dict[int, list] = {}
    for annotation in annotations:
        state = _from_annotation(annotation, grouped)
        if state is not None:
            grouped.setdefault(state['frame'], []).append(state)
    existing = {
        row['frame']: row
        for row in db.execute(
            "SELECT frame, deleted, width, height, issues FROM canvas_frames WHERE project_id=? AND kind='2d'",
            (project_id,),
        )
    }
    for frame in set(existing) - set(grouped):
        db.execute("DELETE FROM canvas_frames WHERE project_id=? AND kind='2d' AND frame=?", (project_id, frame))
    for frame, states in grouped.items():
        previous = existing.get(frame)
        db.execute(
            'INSERT OR REPLACE INTO canvas_frames VALUES (?,?,?,?,?,?,?,?)',
            (
                project_id,
                '2d',
                frame,
                previous['deleted'] if previous else 0,
                previous['width'] if previous else 0,
                previous['height'] if previous else 0,
                json.dumps(states),
                previous['issues'] if previous else '{}',
            ),
        )


def _from_annotation(annotation, grouped: dict[int, list]):
    if not isinstance(annotation, dict):
        return None
    shape = annotation.get('type')
    if shape not in {'rectangle', 'polygon'}:
        return None
    points = annotation.get('points')
    if not isinstance(points, list):
        return None
    flat = []
    for point in points:
        if not isinstance(point, dict):
            return None
        try:
            flat.extend((_number(point.get('x'), 'x'), _number(point.get('y'), 'y')))
        except CanvasError:
            return None
    try:
        frame = _int(annotation.get('frame'), 'frame')
    except CanvasError:
        return None
    if frame < 0:
        return None
    if shape == 'rectangle' and len(flat) != 4:
        return None
    if shape == 'polygon' and (len(flat) < 6 or len(flat) % 2):
        return None
    used = {state['clientID'] for states in grouped.values() for state in states}
    label = annotation.get('label') if isinstance(annotation.get('label'), str) else 'Object'
    track = annotation.get('trackId')
    return _common({
        'clientID': _stable_client_id(str(annotation.get('id', flat)), used),
        'objectType': 'track' if track else 'shape',
        'label': label,
        'occluded': False,
        'source': 'octate',
        'attributes': {
            'octateId': annotation.get('id'),
            'confidence': annotation.get('confidence'),
            'approved': annotation.get('approved'),
            'trackId': track,
        },
        'keyframe': bool(annotation.get('keyframe', True)),
    }, frame, flat) | {'shapeType': shape, 'rotation': 0, 'elements': None}


def _stable_client_id(value: str, used: set[int]) -> int:
    client_id = zlib.crc32(value.encode()) & 0x7FFFFFFF or 1
    while client_id in used:
        client_id += 1
    return client_id


def _project(db, project_id: str):
    row = db.execute('SELECT id, frame_dir, frames FROM projects WHERE id=?', (project_id,)).fetchone()
    if row is None:
        raise CanvasError('project not found', 404)
    return row


def _scene(db, data_root: Path, project, kind: str, frame: int) -> dict:
    saved = db.execute(
        'SELECT * FROM canvas_frames WHERE project_id=? AND kind=? AND frame=?',
        (project['id'], kind, frame),
    ).fetchone()
    image = _frame_image(project, frame)
    probed = jpeg_size(image) if image else None
    if kind == '3d':
        cloud = _cloud_path(data_root, project['id'], frame)
        width = saved['width'] if saved else 0
        height = saved['height'] if saved else 0
        frame_data = {
            'number': frame,
            'deleted': bool(saved['deleted']) if saved else False,
            'width': width,
            'height': height,
            'cloud': f"/api/canvas/3d/{project['id']}/frames/{frame}/cloud" if cloud.is_file() else None,
        }
        return {
            'canvas': '3d',
            'frameData': frame_data,
            'objectStates': json.loads(saved['states']) if saved else [],
        }
    width, height = probed or ((saved['width'], saved['height']) if saved else (0, 0))
    return {
        'canvas': '2d',
        'frameData': {
            'number': frame,
            'deleted': bool(saved['deleted']) if saved else False,
            'width': width,
            'height': height,
            'image': f"/api/projects/{project['id']}/frames/{frame}" if image else None,
        },
        'objectStates': json.loads(saved['states']) if saved else [],
        'issueRegions': json.loads(saved['issues']) if saved else {},
    }


def _dimensions(data_root: Path, project, kind: str, frame: int, body: dict) -> tuple[int, int]:
    if kind == '2d':
        image = _frame_image(project, frame)
        probed = jpeg_size(image) if image else None
        if probed:
            return probed
    else:
        cloud = _cloud_path(data_root, project['id'], frame)
        if cloud.is_file():
            return _pcd_size(cloud.read_bytes())
    return _optional_size(body.get('width', 0)), _optional_size(body.get('height', 0))


def _optional_size(value) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CanvasError('width and height must be non-negative integers')
    return value


def _frame_image(project, frame: int) -> Path | None:
    if not project['frame_dir']:
        return None
    path = Path(project['frame_dir']) / f'frame-{frame:06d}.jpg'
    return path if path.is_file() else None


def _cloud_path(data_root: Path, project_id: str, frame: int) -> Path:
    return data_root / 'canvas3d' / project_id / f'frame-{frame:06d}.pcd'


def jpeg_size(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    if data[:2] != b'\xff\xd8':
        return None
    index = 2
    while index + 8 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        if marker in {0xC0, 0xC1, 0xC2}:
            height = int.from_bytes(data[index + 5:index + 7], 'big')
            width = int.from_bytes(data[index + 7:index + 9], 'big')
            return width, height
        if marker in {0xD8, 0xD9}:
            index += 2
            continue
        length = int.from_bytes(data[index + 2:index + 4], 'big')
        if length < 2:
            return None
        index += 2 + length
    return None


def _pcd_size(raw: bytes) -> tuple[int, int]:
    header = raw.split(b'DATA', 1)[0].decode('ascii', errors='ignore')
    width = height = 0
    for line in header.splitlines():
        if line.startswith('WIDTH '):
            width = int(line.split()[1])
        elif line.startswith('HEIGHT '):
            height = int(line.split()[1])
    return width, height


def _state_2d(item, frame: int) -> dict:
    if not isinstance(item, dict):
        raise CanvasError('each object state must be an object')
    shape = item.get('shapeType')
    points = _numbers(item.get('points'), 'points')
    if shape in FIXED_SHAPES and len(points) != FIXED_SHAPES[shape]:
        raise CanvasError(f'{shape} points must contain {FIXED_SHAPES[shape]} numbers')
    if shape in EVEN_SHAPES:
        if len(points) < EVEN_SHAPES[shape] or len(points) % 2:
            raise CanvasError(f'{shape} points must be an even list of at least {EVEN_SHAPES[shape]} numbers')
    elif shape == 'mask':
        if len(points) < 4:
            raise CanvasError('mask points must end with left, top, right, bottom')
    elif shape == 'skeleton':
        if len(points) % 2:
            raise CanvasError('skeleton points must be an even list')
    elif shape not in FIXED_SHAPES:
        raise CanvasError('shapeType must be rectangle, polygon, polyline, points, ellipse, cuboid, mask, or skeleton')
    elements = item.get('elements') or []
    if shape == 'skeleton':
        if not isinstance(elements, list):
            raise CanvasError('skeleton elements must be a list')
        elements = [_state_2d({**element, 'shapeType': element.get('shapeType', 'points')}, frame) for element in elements]
    elif elements:
        raise CanvasError('elements are only valid on a skeleton')
    return _common(item, frame, points) | {
        'shapeType': shape,
        'rotation': _number(item.get('rotation', 0), 'rotation'),
        'elements': elements if shape == 'skeleton' else None,
    }


def _state_3d(item, frame: int) -> dict:
    if not isinstance(item, dict):
        raise CanvasError('each object state must be an object')
    if item.get('shapeType', 'cuboid') != 'cuboid':
        raise CanvasError('canvas3d only stores cuboids')
    points = _numbers(item.get('points'), 'points')
    if len(points) != 9:
        raise CanvasError('cuboid points must be position[3], rotation[3], scale[3]')
    if any(value <= 0 for value in points[6:9]):
        raise CanvasError('cuboid scale must be positive')
    state = _common(item, frame, points)
    state['shapeType'] = 'cuboid'
    state['rotation'] = 0
    state['elements'] = None
    return state


def _common(item, frame: int, points: list[float]) -> dict:
    declared = item.get('frame', frame)
    if isinstance(declared, bool) or not isinstance(declared, int) or declared != frame:
        raise CanvasError('object frame must match the requested frame')
    object_type = item.get('objectType', 'shape')
    if object_type not in {'shape', 'track'}:
        raise CanvasError('objectType must be shape or track')
    group = item.get('group') or {}
    if not isinstance(group, dict):
        raise CanvasError('group must be an object')
    group_id = group.get('id', 0)
    if isinstance(group_id, bool) or not isinstance(group_id, int):
        raise CanvasError('group.id must be an integer')
    attributes = item.get('attributes') or {}
    descriptions = item.get('descriptions') or []
    if not isinstance(attributes, dict) or not isinstance(descriptions, list):
        raise CanvasError('attributes must be an object and descriptions a list')
    return {
        'clientID': _client_id(item.get('clientID')),
        'objectType': object_type,
        'points': points,
        'frame': frame,
        'label': _label(item.get('label')),
        'occluded': bool(item.get('occluded', False)),
        'outside': bool(item.get('outside', False)),
        'hidden': bool(item.get('hidden', False)),
        'lock': bool(item.get('lock', False)),
        'pinned': bool(item.get('pinned', False)),
        'zOrder': _int(item.get('zOrder', 0), 'zOrder'),
        'updated': _int(item.get('updated', 0), 'updated'),
        'source': item.get('source', 'manual') if isinstance(item.get('source', 'manual'), str) else 'manual',
        'attributes': attributes,
        'descriptions': descriptions,
        'group': {'id': group_id, 'color': str(group.get('color', '#20c997'))},
        'color': str(item.get('color', '#20c997')),
        'keyframe': bool(item.get('keyframe', True)),
    }


def _client_id(value) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise CanvasError('clientID must be an integer')
    return value


def _int(value, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise CanvasError(f'{name} must be an integer')
    return value


def _number(value, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise CanvasError(f'{name} must be a finite number')
    return value


def _numbers(value, name: str) -> list[float]:
    if not isinstance(value, list):
        raise CanvasError(f'{name} must be a list of numbers')
    return [_number(item, name) for item in value]


def _label(value) -> dict:
    if isinstance(value, str) and value.strip():
        return {'id': 0, 'name': value.strip()}
    if isinstance(value, dict) and isinstance(value.get('name'), str) and value['name'].strip():
        return {'id': _int(value.get('id', 0), 'label.id'), 'name': value['name'].strip()}
    raise CanvasError('label must include a name')


def _unique_ids(states: list[dict]) -> None:
    seen = set()
    for state in states:
        if state['clientID'] in seen:
            raise CanvasError(f"duplicate clientID {state['clientID']}")
        seen.add(state['clientID'])
        for element in state.get('elements') or []:
            if element['clientID'] in seen:
                raise CanvasError(f"duplicate clientID {element['clientID']}")
            seen.add(element['clientID'])


def _issues(value) -> dict:
    if not isinstance(value, dict):
        raise CanvasError('issueRegions must be an object')
    cleaned = {}
    for key, region in value.items():
        if not str(key).isdigit():
            raise CanvasError('issue region ids must be numbers')
        if not isinstance(region, dict):
            raise CanvasError('each issue region must be an object')
        cleaned[str(int(key))] = {
            'hidden': bool(region.get('hidden', False)),
            'points': _numbers(region.get('points'), 'issue points'),
        }
    return cleaned
