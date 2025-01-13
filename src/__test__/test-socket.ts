Bun.serve({
  port: 8080,

  websocket: {
    open(ws) {
      console.log("Client connected")

      // Send "hello world" immediately after connection
      ws.send("hello world")

      // Send 5 success messages, one every second
      let count = 0
      const interval = setInterval(() => {
        count++
        ws.send(`success ${count}`)
        if (count === 5) {
          clearInterval(interval)

          // Emit a disconnect event after the 5th message
          ws.close(1000, "Disconnecting after success messages")
        }
      }, 1000)
    },

    close(ws, code, reason) {
      console.log(`Client disconnected: ${code} - ${reason}`)
    },

    message(ws, message) {
      console.log("Received message:", message)
    },

    // error(ws, error) {
    //   console.error("WebSocket error:", error)
    // },
  },

  fetch(req, server) {
    if (server.upgrade(req)) {
      return // WebSocket upgrade handled
    }
    return new Response("This is a WebSocket server.")
  },
})

console.log("WebSocket server running on ws://localhost:8080")
