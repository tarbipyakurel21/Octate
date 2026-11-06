"""Octate product API server. Standard-library only for a small prototype."""
from __future__ import annotations
import json, os, shutil, sqlite3, subprocess, urllib.request, uuid
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; DATA=Path(os.getenv('OCTATE_DATA',ROOT/'data/runtime')); DB=Path(os.getenv('OCTATE_DB',DATA/'octate.db')); MODEL=os.getenv('MODEL_SERVER_URL','http://localhost:8090')
DB.parent.mkdir(parents=True,exist_ok=True)
def conn():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;c.executescript('''CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT,video_name TEXT,status TEXT,frames INTEGER,fps REAL,updated_at TEXT,frame_dir TEXT);CREATE TABLE IF NOT EXISTS annotations(id TEXT PRIMARY KEY,project_id TEXT,payload TEXT);CREATE TABLE IF NOT EXISTS review_items(id TEXT PRIMARY KEY,project_id TEXT,frame INTEGER,score REAL,reasons TEXT,status TEXT,annotation_id TEXT);CREATE TABLE IF NOT EXISTS model_runs(id TEXT PRIMARY KEY,project_id TEXT,kind TEXT,status TEXT,created_at TEXT);''')
 try:c.execute('ALTER TABLE projects ADD COLUMN frame_dir TEXT')
 except sqlite3.OperationalError:pass
 return c
def seed():
 c=conn()
 if not c.execute('SELECT 1 FROM projects').fetchone():c.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)',('demo','Laparoscopic instrument study','synthetic_cholecystectomy.mp4','ready',240,24,datetime.now(timezone.utc).isoformat(),None))
 c.commit();c.close()
seed()
def project(row):
 c=conn();n=c.execute("SELECT count(*) FROM review_items WHERE project_id=? AND status='pending'",(row['id'],)).fetchone()[0];c.close();return{'id':row['id'],'name':row['name'],'videoName':row['video_name'],'status':row['status'],'frames':row['frames'],'fps':row['fps'],'uncertain':n or (3 if row['id']=='demo' else 0),'updatedAt':row['updated_at']}
def parse_fps(value):
 try:
  n,d=value.split('/');return round(float(n)/float(d),3) if float(d) else 0
 except (AttributeError,ValueError,ZeroDivisionError):return 0
def extract_video(video,frames_dir):
 frames_dir.mkdir(parents=True,exist_ok=True)
 try:
  probe=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=avg_frame_rate','-of','default=noprint_wrappers=1:nokey=1',str(video)],check=True,capture_output=True,text=True,timeout=30)
  fps=parse_fps(probe.stdout.strip())
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(video),'-q:v','2','-start_number','0',str(frames_dir/'frame-%06d.jpg')],check=True,capture_output=True,text=True,timeout=600)
 except (FileNotFoundError,subprocess.CalledProcessError,subprocess.TimeoutExpired) as exc:
  raise RuntimeError('FFmpeg could not process the uploaded video') from exc
 count=len(list(frames_dir.glob('frame-*.jpg')))
 if not count:raise RuntimeError('FFmpeg extracted no video frames')
 return count,fps or 24
def upload_parts(handler):
 content_type=handler.headers.get('Content-Type','')
 if not content_type.startswith('multipart/form-data'):raise ValueError('Expected a multipart folder upload')
 raw=handler.rfile.read(int(handler.headers.get('Content-Length','0')))
 message=BytesParser(policy=policy.default).parsebytes(f'Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n'.encode()+raw)
 parts=[]
 for part in message.iter_attachments():
  name=part.get_filename()
  if name:parts.append((Path(name).name,part.get_payload(decode=True) or b''))
 if not parts:raise ValueError('The upload folder contains no files')
 return parts
class Handler(BaseHTTPRequestHandler):
 def body(self):n=int(self.headers.get('Content-Length','0'));return json.loads(self.rfile.read(n) or b'{}')
 def send_json(self,data,status=200):
  raw=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.send_header('Access-Control-Allow-Origin','*');self.end_headers();self.wfile.write(raw)
 def do_OPTIONS(self):self.send_response(204);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Access-Control-Allow-Methods','GET,POST,PUT,PATCH');self.end_headers()
 def do_GET(self):
  c=conn();parts=self.path.strip('/').split('/')
  if self.path=='/api/health':self.send_json({'status':'ok','database':'sqlite','mode':'prototype'});return
  if self.path=='/api/projects':self.send_json([project(r) for r in c.execute('SELECT * FROM projects ORDER BY updated_at DESC')]);return
  if len(parts)==5 and parts[:2]==['api','projects'] and parts[3]=='frames':
   try:frame=int(parts[4])
   except ValueError:self.send_json({'error':'invalid frame'},400);return
   row=c.execute('SELECT frame_dir FROM projects WHERE id=?',(parts[2],)).fetchone();path=Path(row['frame_dir'])/f'frame-{frame:06d}.jpg' if row and row['frame_dir'] else None
   if not path or not path.is_file():self.send_json({'error':'frame not found'},404);return
   raw=path.read_bytes();self.send_response(200);self.send_header('Content-Type','image/jpeg');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
  if len(parts)==4 and parts[:2]==['api','projects'] and parts[3]=='annotations':self.send_json([json.loads(r[0]) for r in c.execute('SELECT payload FROM annotations WHERE project_id=?',(parts[2],))]);return
  if len(parts)==4 and parts[:2]==['api','projects'] and parts[3]=='review':self.send_json([{'id':r['id'],'frame':r['frame'],'score':r['score'],'reasons':json.loads(r['reasons']),'status':r['status'],'annotationId':r['annotation_id']} for r in c.execute('SELECT * FROM review_items WHERE project_id=? ORDER BY score DESC',(parts[2],))]);return
  c.close()
  if self.path.startswith('/api/'):self.send_json({'error':'not found'},404);return
  self.send_json({'error':'not found'},404)
 def do_POST(self):
  if self.path=='/api/projects/upload':
   c=conn()
   try:
    files=upload_parts(self);video=next(((n,b) for n,b in files if Path(n).suffix.lower() in {'.mp4','.mov','.avi','.mkv','.webm','.m4v'}),None)
    if not video:raise ValueError('Upload a folder containing an MP4, MOV, AVI, MKV, WEBM, or M4V video')
    ident=str(uuid.uuid4());folder=DATA/'projects'/ident;folder.mkdir(parents=True);video_path=folder/video[0];video_path.write_bytes(video[1]);count,fps=extract_video(video_path,folder/'frames');now=datetime.now(timezone.utc).isoformat();c.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)',(ident,Path(video[0]).stem,video[0],'ready',count,fps,now,str(folder/'frames')));c.commit();row=c.execute('SELECT * FROM projects WHERE id=?',(ident,)).fetchone();self.send_json(project(row),201)
   except (ValueError,RuntimeError) as exc:self.send_json({'error':str(exc)},400)
   return
  data=self.body();parts=self.path.strip('/').split('/');c=conn()
  if self.path=='/api/projects':
    ident=str(uuid.uuid4());now=datetime.now(timezone.utc).isoformat();c.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)',(ident,data.get('name','Untitled surgical video'),data.get('video_name','uploaded_video.mp4'),'ready',240,24,now,None));c.commit();row=c.execute('SELECT * FROM projects WHERE id=?',(ident,)).fetchone();self.send_json(project(row),201);return
  if len(parts)==3 and parts[:2]==['api','inference']:
   kind=parts[2];run=str(uuid.uuid4());c.execute('INSERT INTO model_runs VALUES(?,?,?,?,?)',(run,data['project_id'],kind,'running',datetime.now(timezone.utc).isoformat()));c.commit()
   try:
    req=urllib.request.Request(f'{MODEL}/api/inference/{kind}',json.dumps(data).encode(),{'Content-Type':'application/json'});result=json.loads(urllib.request.urlopen(req,timeout=8).read())
   except Exception:result=mock(kind,int(data.get('frame',0)))
   for a in result['annotations']:c.execute('INSERT OR REPLACE INTO annotations VALUES(?,?,?)',(a['id'],data['project_id'],json.dumps(a)))
   for r in result['review_items']:c.execute('INSERT OR REPLACE INTO review_items VALUES(?,?,?,?,?,?,?)',(r['id'],data['project_id'],r['frame'],r['score'],json.dumps(r['reasons']),r['status'],r['annotationId']))
   c.execute("UPDATE model_runs SET status='complete' WHERE id=?",(run,));c.commit();result['job_id']=run;self.send_json(result);return
  self.send_json({'error':'not found'},404)
 def do_PUT(self):
  parts=self.path.strip('/').split('/');data=self.body();c=conn()
  if len(parts)==4 and parts[:2]==['api','projects'] and parts[3]=='annotations':
   c.execute('DELETE FROM annotations WHERE project_id=?',(parts[2],));c.executemany('INSERT INTO annotations VALUES(?,?,?)',[(a['id'],parts[2],json.dumps(a)) for a in data]);c.commit();self.send_json({'saved':len(data)});return
  self.send_json({'error':'not found'},404)
 def do_PATCH(self):
  parts=self.path.strip('/').split('/');data=self.body();c=conn()
  if len(parts)==3 and parts[:2]==['api','review']:
   c.execute('UPDATE review_items SET status=? WHERE id=?',(data['status'],parts[2]));c.commit();r=c.execute('SELECT * FROM review_items WHERE id=?',(parts[2],)).fetchone();self.send_json({'id':r['id'],'frame':r['frame'],'score':r['score'],'reasons':json.loads(r['reasons']),'status':r['status'],'annotationId':r['annotation_id']});return
  self.send_json({'error':'not found'},404)
def mock(kind,frame):
 ident=str(uuid.uuid4());polygon=kind=='segment';ann={'id':ident,'frame':frame,'label':'Tissue boundary' if polygon else 'Surgical instrument','type':'polygon' if polygon else 'rectangle','points':[{'x':32,'y':32},{'x':52,'y':25},{'x':64,'y':52},{'x':41,'y':65}] if polygon else [{'x':35,'y':24},{'x':59,'y':57}],'confidence':.68,'approved':False,'keyframe':True};review={'id':str(uuid.uuid4()),'frame':frame,'score':.64,'reasons':['Low detection confidence (68%)','Temporal position changed from previous frame'],'status':'pending','annotationId':ident};return{'annotations':[ann],'review_items':[review],'mode':'deterministic-demo'}
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT','8080'))),Handler).serve_forever()
