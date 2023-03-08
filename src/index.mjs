import {existsSync} from 'fs';
import {resolve, join} from 'path';

export default function () {
    const paths = [
        resolve(join(__dirname, '..', 'golem-requestor', 'yagna')),
        resolve(join(__dirname, '..', 'golem-requestor', 'yagna.exe'))
    ];
    for (const bin of paths) {
        if (existsSync(bin)) {
            return bin
        }
    }
    throw new Error('golem binary not found, it may not be installed or an error may have occurred during installation')
}
