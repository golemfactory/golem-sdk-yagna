import {Readable} from 'node:stream';
import unzip from 'unzip-stream';
import gunzip from 'gunzip-maybe';
import tar from 'tar-fs';
import fs from 'fs';
import path from 'path';
import info from '../package.json' assert {type: 'json'};
import {fileURLToPath} from 'url';
import cproc from 'child_process';

const isWin = process.platform === 'win32'

function repoPath({os, arch, version}) {
    const ext = os == 'windows' ? '.zip' : '.tar.gz';
    const selector = arch == 'x64' ? os : `${os}_${arch}`;

    return `https://github.com/golemfactory/yagna/releases/download/v0.12.0/golem-requestor-${selector}-v${version}${ext}`;
}

async function link({depBin, name}) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    let localBin = path.resolve(path.join(__dirname, '..', 'bin', name))

    if (isWin) {
        localBin += '.exe'
    }

    if (!fs.existsSync(depBin)) {
        throw new Error(`${depBin} binary not found.`)
    }

    if (fs.existsSync(localBin)) {
        fs.unlinkSync(localBin)
    }

    console.info('Linking', depBin, 'to', localBin)
    fs.symlinkSync(depBin, localBin)

    if (isWin) {
        // On Windows, update the shortcut file to use the .exe
        const cmdFile = path.join(__dirname, '..', '..', `${name}.cmd`)

        fs.writeFileSync(cmdFile, `@ECHO OFF
  "%~dp0\\node_modules\\${info.name}\\bin\\${name}.exe" %*`)
    }

    // test ipfs installed correctly.
    var result = cproc.spawnSync(localBin, ['-V'])
    if (result.error) {
        throw new Error(`${name} binary failed: ${result.error}`)
    }

    var outstr = result.stdout.toString()
    console.log('v=', outstr);

    return localBin
}


async function install({os, arch, version, installPath}) {
    const url = repoPath({os, arch, version});
    installPath = installPath ?? process.cwd();

    const resp = await fetch(url);

    console.log('response', resp.status, resp.statusText, 'url=', url);
    if (!resp.ok) {
        return false;
    }
    const downloadStream = Readable.fromWeb(resp.body);
    const binPath = path.join(installPath, 'golem-requestor');
    if (!fs.existsSync(binPath)) {
        fs.mkdirSync(binPath);
    }

    if (url.endsWith('.zip')) {
        await downloadStream.pipe(unzip.Extract({path: binPath}));
    } else {
        await downloadStream.pipe(gunzip()).pipe(tar.extract(binPath, {strip: 1}));
    }
    await link({depBin: path.join(binPath, 'yagna'), name: 'yagna'});
    await link({depBin: path.join(binPath, 'gftp'), name: 'gftp'});
}


install({os: process.platform, arch: process.arch, version: info.version}).catch(err => {
    console.error(err);
    process.exit(1);
});
