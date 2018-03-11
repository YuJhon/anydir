const fs = require('fs');
const path = require('path');
const promisify = require('util').promisify;
const stat = promisify(fs.stat);
const readDir = promisify(fs.readdir);
const handlebars = require('handlebars');
const config = require('../config/defaultConfig');
const mime = require('./mime');
const compress = require('./compress');
const range = require('./range');
const isFresh = require('./cache');

const source = fs.readFileSync(path.join(__dirname, '../template/dir.tpl'), 'utf-8');
const template = handlebars.compile(source);

module.exports = async function(req, res, filePath) {
    try {
        const stats = await stat(filePath);
        if (stats.isFile()) {
            const contentType = mime(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            if (isFresh(stats, req, res)) {
                res.statusCode = 304;
                res.end();
                return;
            }
            /* 部分读取内容 ：CURL -r 10-20 -i http://localhost:9275/LICENSE */
            let rs;
            const { code, start, end } = range(stats.size, req, res);
            if (code === 200) {
                res.statusCode = 200;
                rs = fs.createReadStream(filePath);
            } else {
                res.statusCode = 206;
                rs = fs.createReadStream(filePath, { start, end });
            }
            /* 压缩 */
            if (filePath.match(config.compress)) {
                rs = compress(rs, req, res);
            }
            rs.pipe(res);
        } else if (stats.isDirectory()) {
            const files = await readDir(filePath);
            const dir = path.relative(config.root, filePath);
            res.statusCode = 200;
            const data = {
                title: path.basename(filePath),
                dir: dir ? `/${dir}` : '',
                files: files.map(file => {
                    return {
                        file,
                        icon: mime(file)
                    }
                })
            }
            res.setHeader('Content-Type', 'text/html'); //text/html
            res.end(template(data));
        }
    } catch (ex) {
        console.error(`error:` + ex);
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain'); //text/html
        res.end(`${filePath} is not a directory or file`);
        return;
    }
}