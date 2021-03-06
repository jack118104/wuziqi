const { socketCookieParser, store, socketSession } = require('./lib/middlewares')
const aiHandle = require('./handles/aiHandle')

module.exports = (server) => {
    const io = require('socket.io')(server, {
        pingInterval: 1000,
        pingTimeout: 5000,
        cookie: true
    })
    io.use(socketCookieParser());
    io.use(socketSession)
    io.on('connection', function(socket) {
        // store.get(socket.request.cookies['connect.sid'], (err) => {
        //     console.log(err)
        // })
        // socket.use((packet, next) => {
        //     console.log(packet)
        //     console.log("123")
        //     socket.disconnect(true)
        //     if (packet.doge === true) return next();
        //     next(new Error('Not a doge error'));
        // });

        // console.log('cookies', getSession(socket.request).then((res) => {
        //     console.log(res)
        // }))
        aiHandle(io, socket)
    });
}