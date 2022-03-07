const log = require('../log')
const config = require('../config')
const ping = require('../ping')
const telegram = require('../telegram')

const _ = require('lodash')
const async = require('async')
const ngrok = require('ngrok')
const p2c = require('promise-to-callback')

const interval = 10000

const isProduction = process.env.NODE_ENV === 'production'
const authtoken = process.env.NGROK_AUTH_TOKEN
const region = process.env.NGROK_REGION
const adminHost = process.env.ADMIN_HOST
const adminPassword = process.env.ADMIN_PASSWORD
const publicPassword = process.env.PUBLIC_PASSWORD

let hosts = {}

exports.start = (cb) => {
  cb = cb || function () {}

  if (!authtoken || !region) {
    log.warn(`remote access is disabled because NGROK_AUTH_TOKEN and/or NGROK_REGION is missing`)
    return cb()
  }

  if (!adminPassword) {
    log.warn(`remote admin access is disabled because ADMIN_PASSWORD is missing`)
  }

  async.forever((next) => {
    if (!isProduction || !ping.isAlive()) {
      return setTimeout(next, interval)
    }

    const isSsh = config.get('ssh')
    const isPublic = !!config.get('public')
    const telegramRecipients = _.split(config.get('telegramRecipients'), ',')

    async.series([
      (cb) => {
        if (hosts.ssh && !isSsh) {
          p2c(ngrok.disconnect())((err, result) => {
            if (!err) {
              hosts = {}
              log.info('disconnected all')
            }

            cb(err)
          })
        } else {
          cb()
        }
      },
      (cb) => {
        if (!hosts.ssh && isSsh) {
          const params = {
            proto: 'tcp',
            addr: 22,
            region,
            authtoken
          }

          p2c(ngrok.connect(params))((err, host) => {
            if (err) {
              return cb(err)
            }

            hosts.ssh = host

            const message = `connected ssh: ${host.replace(/ssh:/, '')}`
            log.debug(message)

            telegram.sendMessage(telegramRecipients, message, true, cb)
          })
        } else {
          cb()
        }
      },
      (cb) => {
        if (!hosts.admin) {
          const params = {
            proto: 'http',
            bind_tls: true,
            addr: 80,
            region,
            authtoken
          }

          if (adminHost) {
            params[adminHost.includes('.') ? 'hostname' : 'subdomain'] = adminHost
          }

          p2c(ngrok.connect(params))((err, host) => {
            if (err) {
              return cb(err)
            }

            hosts.admin = host

            const message = `connected admin: ${host}`
            log.debug(message)

            adminHost ? cb() : telegram.sendMessage(telegramRecipients, message, true, cb)
          })
        } else {
          cb()
        }
      },
      (cb) => {
        if (hosts.public && !isPublic) {
          p2c(ngrok.disconnect(hosts.public.host))((err, result) => {
            if (!err) {
              delete hosts.public
              log.info('disconnected public')
            }

            cb(err)
          })
        } else {
          cb()
        }
      },
      (cb) => {
        if (!hosts.public && isPublic && publicPassword) {
          const params = {
            proto: 'http',
            bind_tls: true,
            addr: 80,
            region,
            authtoken
          }

          if (publicHost) {
            params[publicHost.includes('.') ? 'hostname' : 'subdomain'] = publicHost
          }

          p2c(ngrok.connect(params))((err, host) => {
            if (err) {
              return cb(err)
            }

            hosts.public = host

            const message = `connected public: ${host}`
            log.debug(message)

            publicHost ? cb() : telegram.sendMessage(telegramRecipients, message, true, cb)
          })
        } else {
          cb()
        }
      }
    ], (err) => {
      if (err) {
        log.warn(`connection failed: ${err}`)
      }

      setTimeout(next, interval)
    })
  })

  cb()
}
