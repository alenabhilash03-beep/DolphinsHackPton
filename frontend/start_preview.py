"""Run the self-contained Hypothesim review on this computer. No hosting or Git writes."""
import os,sys,shutil,subprocess,socket,time,urllib.request,webbrowser,signal,venv
from pathlib import Path
ROOT=Path(__file__).resolve().parent
FRONTEND=ROOT;BACKEND=ROOT.parent
def run(command,cwd=ROOT):
    print('Preparing local dependencies…',flush=True)
    subprocess.run(command,cwd=cwd,check=True)
def available(start):
    for port in range(start,start+30):
        with socket.socket() as sock:
            try:sock.bind(('127.0.0.1',port));return port
            except OSError:pass
    raise RuntimeError('No free local preview port found.')
def main():
    # Reuse the user's existing local key when updating to this review build.
    destination=FRONTEND/'.local-preview/provider.env'
    for previous in [Path.home()/'Documents/Hypothesim-local-preview-v3',ROOT.parent/'Hypothesim-local-preview-v2',Path.home()/'Documents/Hypothesim-local-preview-v2',ROOT.parent/'Hypothesim-local-preview',Path.home()/'Documents/Hypothesim-local-preview']:
        source=previous/'frontend/.local-preview/provider.env'
        if previous!=ROOT and not destination.exists() and source.is_file():
            destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source,destination);destination.chmod(0o600)
            print('Reused the existing local provider configuration.',flush=True)
            break
    node=shutil.which('node');npm=shutil.which('npm.cmd' if os.name=='nt' else 'npm')
    if not node or not npm:
        print('Install Node.js 22 or newer from https://nodejs.org, then run this script again.');return 1
    version=subprocess.check_output([node,'--version'],text=True).strip()
    if int(version.lstrip('v').split('.')[0])<22:
        print('Node.js 22 or newer is required. Current version: '+version);return 1
    uv=shutil.which('uv')
    if not uv:
        bootstrap=ROOT/'.bootstrap'
        python=bootstrap/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
        if not python.exists():venv.EnvBuilder(with_pip=True).create(bootstrap)
        run([str(python),'-m','pip','install','uv>=0.9,<1'])
        uv=str(bootstrap/('Scripts/uv.exe' if os.name=='nt' else 'bin/uv'))
    run([uv,'sync','--locked','--project',str(BACKEND)])
    if not (FRONTEND/'node_modules/next/package.json').exists():run([npm,'ci'],FRONTEND)
    web_port=available(3011);api_port=available(8011)
    env=os.environ.copy();env.update({'PORT':str(web_port),'SCIENTIFIC_API_PORT':str(api_port),'SCIENTIFIC_ENGINE_DIR':str(BACKEND),'SCIENTIFIC_PYTHON':str(BACKEND/'.venv'/('Scripts/python.exe' if os.name=='nt' else 'bin/python')),'PREVIEW_HOST':'127.0.0.1'})
    command=[node,'scripts/start-local-preview.mjs','--port',str(web_port)]
    process=subprocess.Popen(command,cwd=FRONTEND,env=env,start_new_session=os.name!='nt')
    url=f'http://127.0.0.1:{web_port}/local-setup'
    print('\nHypothesim local preview: '+url+'\nYour NVIDIA key goes into the browser form, not the terminal.\nPress Ctrl+C here to stop both services.\n',flush=True)
    try:
        for _ in range(180):
            if process.poll() is not None:raise RuntimeError('The local preview stopped before it became ready. Read the service error above.')
            try:
                with urllib.request.urlopen(url,timeout=2) as response:
                    if response.status==200:break
            except Exception:time.sleep(.5)
        else:raise RuntimeError('The preview did not become ready. Read the service error above.')
        webbrowser.open(url,new=2)
        process.wait()
    except KeyboardInterrupt:
        pass
    finally:
        if process.poll() is None:
            if os.name=='nt':process.terminate()
            else:os.killpg(process.pid,signal.SIGTERM)
            try:process.wait(timeout=12)
            except subprocess.TimeoutExpired:
                if os.name=='nt':process.kill()
                else:os.killpg(process.pid,signal.SIGKILL)
    return 0
if __name__=='__main__':
    try:raise SystemExit(main())
    except (OSError,subprocess.CalledProcessError,RuntimeError) as error:
        print('Could not start the local preview: '+str(error));raise SystemExit(1)
