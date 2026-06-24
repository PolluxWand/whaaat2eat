import fs from 'node:fs';
import path from 'node:path';
import babel from '@babel/standalone';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const sourcePath = path.join(root, 'index.html.source');

const html = fs.readFileSync(sourcePath, 'utf8');
const scriptMatch = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);

if (!scriptMatch) {
  throw new Error('未在 index.html.source 找到 <script type="text/babel">，请确认源码文件没有被构建产物覆盖。');
}

const sourceCode = scriptMatch[1];
const transformed = babel.transform(sourceCode, {
  presets: ['react'],
  comments: false,
  compact: false,
}).code;

const babelScriptPattern = /\n\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone@7\.23\.5\/babel\.min\.js"><\/script>/;
const output = html
  .replace(babelScriptPattern, '')
  .replace(scriptMatch[0], () => `<script>\n${transformed}\n</script>`);

fs.writeFileSync(indexPath, output, 'utf8');

console.log('已从 index.html.source 构建 index.html');
