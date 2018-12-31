"use strict"

const broadcastController = require("./controller")

module.exports.baseUrl = "/broadcast"

module.exports.routes = [
  {
    method: "GET",
    route: "/:hex",
    handlers: [
      broadcastController.getBroadcast
    ]
  },
  {
    method: "GET",
    route: "/decode/:hex",
    handlers: [
      broadcastController.decode
    ]
  }
]
