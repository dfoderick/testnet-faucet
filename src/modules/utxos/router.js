"use strict"

const utxosController = require("./controller")

module.exports.baseUrl = "/utxos"

module.exports.routes = [
  {
    method: "GET",
    route: "/",
    handlers: [
      //ensureUser,
      utxosController.getBalance
    ]
  },
  {
    method: "GET",
    route: "/:hex",
    handlers: [
      utxosController.getUtxos
    ]
  }

]
