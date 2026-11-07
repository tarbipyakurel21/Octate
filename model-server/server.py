"""Small explicit model interface with deterministic demo inference."""
import json,os,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
def inference(kind,data):
 frame=int(data.get('frame',0));w=float(data.get('width') or 100);h=float(data.get('height') or 100)
 def xy(x,y):return {'x':round(x/100*w,2),'y':round(y/100*h,2)}
 ident=str(uuid.uuid4());poly=kind=='segment';points=[xy(29,31),xy(48,22),xy(67,47),xy(46,66)] if poly else [xy(31,26),xy(58,61)];ann={'id':ident,'frame':frame,'label':'Tissue boundary' if poly else 'Surgical instrument','type':'polygon' if poly else 'rectangle','points':points,'confidence':.66 if kind=='detect' else .78,'approved':False,'trackId':f'track-{ident}' if kind=='track' else None,'keyframe':True};reason='Tracking gap or jump detected' if kind=='track' else 'Low detection confidence requires review';return{'annotations':[ann],'review_items':[{'id':str(uuid.uuid4()),'frame':frame,'score':.72,'reasons':[reason,'Shape differs from adjacent frame'],'status':'pending','annotationId':ident}],'mode':'deterministic-demo'}
class H(BaseHTTPRequestHandler):
 def out(self,x,status=200):b=json.dumps(x).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  if self.path=='/api/models':self.out([{'id':'octate-demo','name':'Deterministic demo','capabilities':['detect','segment','track'],'loaded':True}])
  elif self.path.startswith('/api/jobs/'):self.out({'id':self.path.rsplit('/',1)[-1],'status':'complete'})
  else:self.out({'error':'not found'},404)
 def do_POST(self):
  kind=self.path.rsplit('/',1)[-1];n=int(self.headers.get('Content-Length','0'));data=json.loads(self.rfile.read(n) or b'{}')
  if kind not in {'detect','segment','track'}:self.out({'error':'unknown inference action'},404)
  else:self.out(inference(kind,data))
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT','8090'))),H).serve_forever()
