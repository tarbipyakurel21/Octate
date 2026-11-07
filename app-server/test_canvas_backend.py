"""Checks the canvas scene store against the vendored setup() point layouts."""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import canvas_backend

ROOT = Path(__file__).resolve().parents[1]


def test_shapes_and_cuboid():
    with tempfile.TemporaryDirectory() as tmp:
        db, data = _db(Path(tmp))
        _project(db, 'p1', None)
        saved = canvas_backend.put_scene(db, data, _parts('p1', '2d'), {
            'width': 640,
            'height': 480,
            'issueRegions': {'7': {'hidden': False, 'points': [1, 2, 3, 4]}},
            'objectStates': [
                {'clientID': 1, 'shapeType': 'rectangle', 'label': 'Grasper', 'points': [1, 2, 3, 4]},
                {'clientID': 2, 'shapeType': 'ellipse', 'label': {'id': 3, 'name': 'Tip'}, 'points': [10, 10, 20, 4], 'rotation': 15},
                {'clientID': 3, 'shapeType': 'cuboid', 'label': 'Box', 'points': list(range(16))},
                {'clientID': 4, 'shapeType': 'mask', 'label': 'Tissue', 'points': [5, 1, 0, 8, 9, 12]},
                {'clientID': 5, 'shapeType': 'skeleton', 'label': 'Hand', 'points': [], 'elements': [
                    {'clientID': 6, 'shapeType': 'points', 'label': 'Wrist', 'points': [8, 9]},
                ]},
            ],
        })
        assert saved[1]['frameData'] == {
            'number': 42, 'deleted': False, 'width': 640, 'height': 480, 'image': None,
        }
        assert saved[1]['objectStates'][1]['shapeType'] == 'ellipse'
        assert saved[1]['objectStates'][4]['elements'][0]['clientID'] == 6
        assert saved[1]['issueRegions']['7']['points'] == [1, 2, 3, 4]
        scene = canvas_backend.put_scene(db, data, _parts('p1', '3d'), {
            'objectStates': [{'clientID': 1, 'label': 'Instrument', 'points': [1, 2, 3, 0, 0, 0, 1, 0.5, 0.25]}],
        })
        assert scene[1]['objectStates'][0]['points'][6:] == [1, 0.5, 0.25]
        cloud = b'# .PCD v0.7\nWIDTH 4\nHEIGHT 1\nPOINTS 4\nDATA ascii\n0 0 0\n'
        uploaded = canvas_backend.put_cloud(db, data, _parts('p1', '3d') + ['cloud'], cloud)
        assert uploaded[1]['frameData']['width'] == 4
        assert uploaded[1]['frameData']['cloud'].endswith('/cloud')
        assert uploaded[1]['objectStates'][0]['clientID'] == 1
        canvas_backend.mirror_annotations(db, 'p1', [{
            'id': 'a1', 'frame': 3, 'label': 'Grasper', 'type': 'rectangle',
            'points': [{'x': 1, 'y': 2}, {'x': 3, 'y': 4}], 'trackId': 't1', 'keyframe': True,
        }])
        mirrored = canvas_backend.dispatch_get(db, data, ['api', 'canvas', '2d', 'p1', 'frames', '3'])
        assert mirrored[1]['objectStates'][0]['points'] == [1, 2, 3, 4]
        assert mirrored[1]['objectStates'][0]['objectType'] == 'track'


def test_rejections():
    with tempfile.TemporaryDirectory() as tmp:
        db, data = _db(Path(tmp))
        _project(db, 'p1', None)
        for body, message in (
            ({'objectStates': [{'clientID': 1, 'shapeType': 'polygon', 'label': 'A', 'points': [1, 2, 3]}]}, 'even'),
            ({'objectStates': [{'clientID': 1, 'shapeType': 'cuboid', 'label': 'A', 'points': [1, 2, 3, 4]}]}, '16'),
            ({'objectStates': [{'clientID': True, 'shapeType': 'rectangle', 'label': 'A', 'points': [1, 2, 3, 4]}]}, 'clientID'),
        ):
            try:
                canvas_backend.put_scene(db, data, _parts('p1', '2d'), body)
            except canvas_backend.CanvasError as exc:
                assert message in str(exc)
            else:
                raise AssertionError(message)
        try:
            canvas_backend.put_scene(db, data, _parts('p1', '3d'), {
                'objectStates': [{'clientID': 1, 'label': 'A', 'points': [0, 0, 0, 0, 0, 0, 1, 0, 1]}],
            })
        except canvas_backend.CanvasError as exc:
            assert 'scale' in str(exc)
        else:
            raise AssertionError('scale')


def test_jpeg_and_http():
    jpeg = _jpeg(8, 5)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        frames = root / 'frames'
        frames.mkdir()
        (frames / 'frame-000007.jpg').write_bytes(jpeg)
        assert canvas_backend.jpeg_size(frames / 'frame-000007.jpg') == (8, 5)
        env = os.environ.copy()
        env.update({
            'OCTATE_DB': str(root / 'octate.db'),
            'OCTATE_DATA': str(root / 'data'),
            'PORT': '8765',
            'MODEL_SERVER_URL': 'http://127.0.0.1:9',
        })
        proc = subprocess.Popen([sys.executable, 'server.py'], cwd=ROOT / 'app-server', env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            _wait(proc)
            db = sqlite3.connect(root / 'octate.db')
            db.execute(
                "INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)",
                ('demo', 'study', 'clip.mp4', 'ready', 240, 24, 'now', str(frames)),
            )
            db.commit()
            db.close()
            (frames / 'frame-000042.jpg').write_bytes(jpeg)
            _put('/api/canvas/2d/demo/frames/42', {'objectStates': [{'clientID': 1, 'shapeType': 'rectangle', 'label': 'Grasper', 'points': [1, 1, 6, 4]}]})
            _put('/api/canvas/3d/demo/frames/42', {'objectStates': [{'clientID': 1, 'shapeType': 'cuboid', 'label': 'Instrument', 'points': [0, 0, 0, 0, 0, 0, 1, 0.4, 0.4]}]})
            scene = _json('/api/canvas/2d/demo/frames/42')
            assert scene['frameData']['width'] == 8
            assert scene['frameData']['height'] == 5
            assert scene['objectStates'][0]['shapeType'] == 'rectangle'
            cuboid = _json('/api/canvas/3d/demo/frames/42')
            assert len(cuboid['objectStates'][0]['points']) == 9
            body = json.dumps({'objectStates': [{'clientID': 9, 'shapeType': 'points', 'label': 'Mark', 'points': [1, 1]}]}).encode()
            request = urllib.request.Request('http://127.0.0.1:8765/api/canvas/2d/demo/frames/7', data=body, method='PUT', headers={'Content-Type': 'application/json'})
            saved = json.loads(urllib.request.urlopen(request, timeout=3).read())
            assert saved['frameData']['image'].endswith('/frames/7')
            assert saved['objectStates'][0]['clientID'] == 9
        finally:
            proc.terminate()
            proc.wait(timeout=5)


def _db(root: Path):
    db = sqlite3.connect(root / 'test.db')
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE projects (id TEXT, frame_dir TEXT, frames INTEGER)')
    canvas_backend.ensure(db)
    return db, root / 'data'


def _project(db, project_id: str, frame_dir):
    db.execute('INSERT INTO projects VALUES (?,?,?)', (project_id, frame_dir, 1))
    db.commit()


def _parts(project_id: str, kind: str = '2d'):
    return ['api', 'canvas', kind, project_id, 'frames', '42']


def _jpeg(width: int, height: int) -> bytes:
    # Minimal baseline JPEG: SOI, SOF0, EOI. The size parser only needs SOF0.
    sof = b'\xff\xc0\x00\x0b\x08' + height.to_bytes(2, 'big') + width.to_bytes(2, 'big') + b'\x01\x01\x11\x00'
    return b'\xff\xd8' + sof + b'\xff\xd9'


def _wait(proc: subprocess.Popen) -> None:
    for _ in range(50):
        if proc.poll() is not None:
            raise RuntimeError(proc.stderr.read().decode())
        try:
            urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=0.2)
            return
        except OSError:
            time.sleep(0.05)
    raise RuntimeError('server did not start')


def _json(path: str):
    return json.loads(urllib.request.urlopen(f'http://127.0.0.1:8765{path}', timeout=3).read())


def _put(path: str, body: dict):
    request = urllib.request.Request(
        f'http://127.0.0.1:8765{path}',
        data=json.dumps(body).encode(),
        method='PUT',
        headers={'Content-Type': 'application/json'},
    )
    return json.loads(urllib.request.urlopen(request, timeout=3).read())


if __name__ == '__main__':
    test_shapes_and_cuboid()
    test_rejections()
    test_jpeg_and_http()
    print('canvas backend ok')
