/*
  This is the primary source code that starts the server.
*/

"use strict"

const Koa = require("koa")
const bodyParser = require("koa-bodyparser")
const convert = require("koa-convert")
const logger = require("koa-logger")
//const mongoose = require("mongoose")
const session = require("koa-generic-session")
const passport = require("koa-passport")
const mount = require("koa-mount")
const serve = require("koa-static")
const cors = require("kcors")
const wallet = require("../src/utils/wallet")

const config = require("../config")
const errorMiddleware = require("../src/middleware")

// Load the IP Address model.
const IpAddresses = require("../src/models/ip-addresses")

async function startServer() {
  // Create a Koa instance.
  const app = new Koa()
  app.keys = [config.session]

  // Connect to the Mongo Database.
  //mongoose.Promise = global.Promise

  // try {
  //   await mongoose.connect(
  //     config.database,
  //     { useNewUrlParser: true }
  //   )
  //   mongoose.set("useCreateIndex", true) // Stop deprecation warning.
  // } catch (err) {
  //   console.log(`Error trying to connect to Mongo Database: `, err)
  //   console.log(`Exiting.`)
  //   process.exit(0)
  // }

  // MIDDLEWARE START

  app.use(convert(logger()))
  app.use(bodyParser())
  app.use(session())
  app.use(errorMiddleware())

  // Used to generate the docs.
  app.use(convert(mount("/docs", serve(`${process.cwd()}/docs`))))

  // User Authentication
  require("../config/passport")
  app.use(passport.initialize())
  app.use(passport.session())

  // Custom Middleware Modules
  const modules = require("../src/modules")
  modules(app)

  // Enable CORS for testing
  app.use(cors({ origin: "*" }))

  // MIDDLEWARE END

  // app.listen(config.port, () => {
  //  console.log(`Server started on ${config.port}`)
  // })
  await app.listen(config.port)
  console.log(`Server started on ${config.port}`)

  // Cleanup the IP address in the DB every 30 minutes.
  // setInterval(function() {
  //    cleanIPAddresses()
  // }, 1800000)

  // Consolidate UTXOs
  setInterval(function() {
    wallet.consolidateUTXOs()
  }, 1800000 * 12) // six hours

  return app
}
// startServer()

// async function cleanIPAddresses() {
//   try {
//     // Get all IP addresses in the database.
//     const existingIps = await IpAddresses.find({})

//     for (var i = 0; i < existingIps.length; i++) {
//       const thisIp = existingIps[i]
//       const thisTimestamp = new Date(thisIp.timestamp)

//       const now = new Date()
//       const oneDay = 1000 * 60 * 60 * 24
//       const oneDayAgo = now.getTime() - oneDay
//       const yesterday = new Date(oneDayAgo)

//       // Remove the IP from the database if it's older than 24 hours.
//       if (thisTimestamp.getTime() < yesterday.getTime()) await thisIp.remove()
//     }
//   } catch (err) {
//     console.log(`Error in cleanIpAddresses: `, err)
//   }
// }

// export default app
// module.exports = app
module.exports = {
  startServer
}
