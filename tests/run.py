"""Run account-free browser regressions sequentially from the repository root."""
import subprocess,sys,argparse
from pathlib import Path
root=Path(__file__).resolve().parent
names = ['smoke','music-preview','music-persistence','template-storage','template-import','seek','split-boundaries','text-undo','photo-duration','photo-speed','speed-transition','transition-types','filter-types','text-animation','overlay-export','audio-effects','caption-audio','workspace-look','layout','zoom','timeline-geometry','timeline','backup','backup-validation','media-lifecycle','invalid-import','thumbnail-timeout','image-timeout','engine-lock','load-retry','preview','storage','plan-validation','async-stale','caption-bounds','process-stale','process-media','native-save','native-unsupported','offline-parser','export-matrix','portrait-pixel','longer-export','keyframes','speed-curve','rendered-preview','beat-review','video-key','transform-keyframes','patch-tracking','edge-refine','watermark','adjustments','clip-flip','watermark-fonts','clip-volume','layer-opacity','layer-stack','text-position','text-duplicate','numeric-trim','clip-stack','music-source','fade-times','transition-time','music-volume-undo','numeric-seek','redo','frame-step','recovery-journal']
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--start',type=int,default=0,help='Zero-based first script index')
parser.add_argument('--count',type=int,help='Maximum scripts to run (default: remaining)')
args=parser.parse_args()
if args.start<0 or (args.count is not None and args.count<1):parser.error('start must be >=0 and count >=1')
selected=names[args.start:None if args.count is None else args.start+args.count]
if not selected:parser.error('No scripts selected')
for name in selected:
    print('\nTEST',name,flush=True)
    subprocess.run([sys.executable,str(root/(name+'.py'))],check=True)
print('\nSelected regression scripts passed ('+str(len(selected))+'/'+str(len(names))+').')
