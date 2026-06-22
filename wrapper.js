const cp = require('child_process');
const server = cp.spawn('node', ['server/server.js'], { cwd: __dirname });

server.stdout.on('data', d => console.log('OUT: ' + d));
server.stderr.on('data', d => console.log('ERR: ' + d));
server.on('close', code => console.log('EXITED: ' + code));
