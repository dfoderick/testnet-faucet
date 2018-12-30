"use strict"

const broadcastController = require("./controller")

module.exports.baseUrl = "/broadcast"

module.exports.routes = [
  // {
  //   method: "GET",
  //   route: "/",
  //   handlers: [
  //     //ensureUser,
  //     broadcastController.getBalance
  //   ]
  // },
  {
    method: "GET",
    route: "/:hex",
    handlers: [
      broadcastController.getBroadcast
    ]
  }

]
