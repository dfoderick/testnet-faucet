"use strict"

// const ensureUser = require('../../middleware/validators')
const coins = require("./controller")

// export const baseUrl = '/users'
module.exports.baseUrl = "/coins"

module.exports.routes = [
  {
    method: "GET",
    route: "/",
    handlers: [
      //ensureUser,
      coins.getBalance
    ]
  },
  {
    method: "GET",
    ///:amount
    route: "/:address/:amount",
    handlers: [
      // ensureUser,
      coins.getCoins
    ]
  }
  // {
  //   method: "GET",
  //   route: "/:hex",
  //   handlers: [
  //     coins.getBroadcast
  //   ]
  // }

]
