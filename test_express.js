const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Ok'));
const server = app.listen(3000, () => console.log('Listening on 3000'));
server.on('error', (e) => {
    console.error('SERVER ERROR!', e);
});
process.on('exit', code => console.log('PROCESS EXIT:', code));
