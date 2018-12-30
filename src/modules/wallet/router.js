"use strict"

const walletController = require("./controller")

module.exports.baseUrl = "/wallet"

module.exports.routes = [
  {
    method: "GET",
    route: "/",
    handlers: [
      walletController.newWallet
    ]
  }
]
