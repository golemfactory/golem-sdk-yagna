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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function repoPath({os, arch, version}) {
    const ext = os == 'windows' ? '.zip' : '.tar.gz';
    const selector = arch == 'x64' ? os : `${os}_${arch}`;

    return `https://github.com/golemfactory/yagna/releases/download/v${version}/golem-requestor-${selector}-v${version}${ext}`;
}

async function link({binPath, name}) {
    const exe_name = isWin ? `${name}.exe` : name;

    let localBin = path.resolve(path.join(__dirname, '..', 'bin', exe_name))
    let depBin = path.join(binPath, exe_name);

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
    const result = cproc.spawnSync(localBin, ['-V'])
    if (result.error) {
        throw new Error(`${name} binary failed: ${result.error}`)
    }

    var outstr = result.stdout.toString()
    console.log('v=', outstr);

    return localBin
}


async function install({os, arch, version, installPath}) {
    const url = repoPath({os, arch, version});
    installPath = installPath ?? path.join(__dirname, '..');

    const resp = await fetch(url);

    console.log('response', resp.status, resp.statusText, 'url=', url);
    if (!resp.ok) {
        return false;
    }
    const downloadStream = Readable.fromWeb(resp.body);
    const binPath = path.join(installPath, 'golem-requestor');
    console.log('extracting into: ', binPath);
    if (!fs.existsSync(binPath)) {
        fs.mkdirSync(binPath);
    }

    await new Promise((resolve, reject) => {
        if (url.endsWith('.zip')) {
            downloadStream.pipe(unzip.Extract({path: binPath})
                .on('close', resolve)
                .on('error', reject));
        } else {
            downloadStream.pipe(gunzip()).pipe(tar.extract(binPath, {strip: 1})
                .on('finish', resolve)
                .on('error', reject));
        }
    });

    if (!isWin) {
        await link({binPath, name: 'yagna'});
        await link({binPath, name: 'gftp'});
    }
}


function cleanVer(version) {
    const m = /-([0-9]+)/.exec(version);
    if (m) {
        return version.substring(0, m.index);
    }
    return version;
}

install({os: process.platform, arch: process.arch, version: cleanVer(info.version)}).catch(err => {
    console.error(err);
    process.exit(1);
});
