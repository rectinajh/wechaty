// import Profile          from '../profile'
import { log }          from '../config'
import { EventEmitter } from 'events'
import * as cuid        from 'cuid'
import * as WebSocket   from 'ws'
import * as fs          from 'fs'

export const resolverDict: {
  [idx: string]: Function,
} = {}

export interface BridgeOptions {
  // head?   : boolean,
  token:    string,
  // profile:  Profile,
  botWs:    WebSocket,
  // desperate in the future
  autoData: AutoDataType,
}

export interface FunctionType {
  userId:   string,
  msgId:    string,
  apiName:  string,
  param:    string[],
}

export interface AutoDataType {
  wxData?:    string,
  token?:     string,
  user_name?: string,
  nick_name?: string,
}

export class Bridge extends EventEmitter {
  public botWs:     WebSocket
  public userId:    string        // User Token
  public autoData:  AutoDataType

  private username: string
  private password: string
  private nickname: string

  constructor(
    public options: BridgeOptions,
  ) {
    super() // for EventEmitter
    log.verbose('PuppetPuppeteerBridge', 'constructor()')

    this.userId   = options.token
    this.botWs    = options.botWs
    this.autoData = options.autoData
    // this.state = new StateSwitch('PuppetPuppeteerBridge', log)
  }

  private async sendToWebSocket(name: string, args: string[]): Promise<Object> {
    const msgId = cuid()
    const data: FunctionType = {
      userId:   this.userId,
      msgId:    msgId,
      apiName:  name,
      param:    [],
    }

    args.forEach(arg => {
      data.param.push(encodeURIComponent(arg))
    })

    const sendData = JSON.stringify(data)
    log.silly('PuppetPadchatBridge', 'sendToWebSocket: %s', sendData)
    this.botWs.send(sendData)

    return new Promise((resolve, reject) => {
      resolverDict[msgId] = resolve

      setTimeout(() => {
        delete resolverDict[msgId]
        // TODO: send json again or detect init()
        reject('PadChat Server timeout')
      }, 30000)

    })
  }

  /**
   * Init with WebSocket Server
   */
  public async init(): Promise<boolean> {
    // {
    //   "message": "init成功",
    //   "status": 0
    // }
    const result = await this.sendToWebSocket('init', [])
    if (result && (result as any).status === 0) {
      return true
    }
    return false
  }

  /**
   * Get WX block memory
   */
  public async WXInitialize(): Promise<boolean> {
    // {
    //   "message": "WxUserInit成功",
    //   "status": 0
    // }
    const result = await this.sendToWebSocket('WXInitialize', [])
    if (result && (result as any).status === 0) {
      return true
    }
    return false
  }

  // TODO: should generate qrcode here
  public async WXGetQRCode(): Promise<boolean> {
    const result = await this.sendToWebSocket('WXGetQRCode', [])
    if (result && (result as any).qr_code) {
      this.checkQrcode()
      fs.writeFileSync('./demo.jpg', (result as any).qr_code, {encoding: 'base64'})
      return true
    }
    return false
  }

  public WXCheckQRCode(): void {
    this.sendToWebSocket('WXCheckQRCode', [])
  }

  public WXHeartBeat(): void {
    this.sendToWebSocket('WXHeartBeat', [])

  }

  public WXSyncContact(): void {
    this.sendToWebSocket('WXSyncContact', [])
  }

  /**
   * Generate 62 data
   */
  public WXGenerateWxDat(): void {
    this.sendToWebSocket('WXGenerateWxDat', [])
  }

  /**
   * Load 62 data
   * @param {string} wxData     autoData.wxData
   */
  public WXLoadWxDat(wxData: string): void {
    this.sendToWebSocket('WXLoadWxDat', [wxData])
  }

  public WXGetLoginToken(): void {
    this.sendToWebSocket('WXGetLoginToken', [])
  }

  /**
   * Login with token automatically
   * @param {string} token    autoData.token
   */
  public WXAutoLogin(token: string): void {
    this.sendToWebSocket('WXAutoLogin', [token])
  }

  /**
   * Login with QRcode
   * @param {string} token    autoData.token
   */
  public WXLoginRequest(token: string): void {
    this.sendToWebSocket('WXLoginRequest', [token])
  }

  /**
   * Send Text Message
   * @param {string} to       user_name
   * @param {string} content  text
   */
  public WXSendMsg(to: string, content: string, at?: string): void {
    this.sendToWebSocket('WXSendMsg', [to, content, at || ''])
  }

  /**
   * Send Image Message
   * @param {string} to     user_name
   * @param {string} data   image_data
   */
  public WXSendImage(to: string, data: string): void {
    this.sendToWebSocket('WXSendImage', [to, data])
  }

  /**
   * Get contact by contact id
   * @param {any} id        user_name
   */
  public WXGetContact(id: string): void {
    this.sendToWebSocket('WXGetContact', [id])
  }

  /**
   * Login successfully by qrcode
   * @param {any} id        user_name
   * @param {any} password  password
   */
  public async WXQRCodeLogin(id: string, password: string): Promise<void> {
    //   {
    //     "email": "sushishigeshiren@163.com",
    //     "external": "1",
    //     "long_link_server": "szlong.weixin.qq.com",
    //     "message": "
    // �Everything+is+ok",
    //     "nick_name": "苏轼",
    //     "phone_number": "17326998117",
    //     "qq": 0,
    //     "short_link_server": "szshort.weixin.qq.com:80",
    //     "status": 0,
    //     "uin": 324216852,
    //     "user_name": "wxid_zj2cahpwzgie12"
    // }
    const result = this.sendToWebSocket('WXQRCodeLogin', [id, password])

    if (result && (result as any).status === 0) {
      log.info('PuppetPadchatBridge', 'WXQRCodeLogin, login successfully!')

      this.username = (result as any).user_name
      // this.nickname = (result as any).nick_name
      this.loginSucceed()
    }

    if (result && (result as any).status === -3) {
      log.warn('PuppetPadchatBridge', 'WXQRCodeLogin, wrong user_name or password')
      return
    }

    if (result && (result as any).status === 301) {
      log.warn('PuppetPadchatBridge', 'WXQRCodeLogin, redirect 301')
      this.WXQRCodeLogin(this.username, this.password)
      return
    }

    log.warn('PuppetPadchatBridge', 'WXQRCodeLogin, unknown error, data: %s', JSON.stringify(result))
  }

  public async checkQrcode(): Promise<void> {
    log.verbose('PuppetPadchatBridge', 'checkQrcode')

    // {
    //   "device_type": "android",
    //   "expired_time": 238,
    //   "head_url": "http://wx.qlogo.cn/mmhead/ver_1/NkOvv1rTx3Dsqpicnhe0j7cVOR3psEAVfuhFLbmoAcwaob4eENNZlp3KIEsMgibfH4kRjDicFFXN3qdP6SGRXbo7GBs8YpN52icxSeBUX8xkZBA/0",
    //   "nick_name": "苏轼",
    //   tslint:disable-next-line:max-line-length
    //   "password": "extdevnewpwd_CiNBMzBFVVl0Q1Z1WTlaNTczdFlOcThrWThAcXJ0aWNrZXRfMBJAZnNaZG5BS0VhR0ljNExoVWVJUzl2d1ZaWUxvUUs3NU9PQWczZHp6cURrMEJ4dTdrNV9fRmJCbTlMczdJRnVVcBoYZ1NlUTFvV1p2M0hONXVkZ2tlNEk4c05O",
    //   "status": 2,
    //   "user_name": "wxid_zj2cahpwzgie12"
    // }
    const result = await this.sendToWebSocket('WXCheckQRCode', [])

    if (result && (result as any).status === 0) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Please scan the Qrcode!')

      setTimeout(() => {
        this.checkQrcode()
      }, 1000)

      return
    }

    if (result && (result as any).status === 1) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Had scan the Qrcode, but not Login!')

      setTimeout(() => {
        this.checkQrcode()
      }, 1000)
      return
    }

    if (result && (result as any).status === 2) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Trying to login... please wait')

      this.username = (result as any).user_name
      // this.nickname = (result as any).nick_name
      this.password = (result as any).password

      this.WXQRCodeLogin(this.username, this.password)
      return
    }

    if (result && (result as any).status === 3) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Timeout')
      return
    }

    if (result && (result as any).status === 4) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Cancel by user')
      return
    }

    log.warn('PuppetPadchatBridge', 'checkQrcode: not know the reason, return data: %s', JSON.stringify(result))
    return
  }

  public loginSucceed() {
    log.verbose('PuppetPadchatBridge', 'loginSucceed: Set heatbeat to websocket server')
    this.WXHeartBeat()

    log.verbose('PuppetPadchatBridge', 'loginSucceed: Set token to websocket server')
    this.autoData.token = ''
    this.WXGetLoginToken()

    log.verbose('PuppetPadchatBridge', 'loginSucceed: Send ding to the bot')
    this.WXSendMsg(this.username, 'ding')

    // Check 62 data. If has then use, or save 62 data here.
    if (!this.autoData.wxData || this.autoData.user_name !== this.username) {
      log.info('PuppetPadchatBridge', 'loginSucceed: No 62 data, or wrong 62 data')
      this.autoData.user_name = this.username
      this.autoData.nick_name = this.nickname
      this.WXGenerateWxDat()
    }

    this.saveConfig()

    log.verbose('PuppetPadchatBridge', 'loginSucceed: Send login to the bot')
    this.WXSendMsg(this.username, 'Bot on line!')

    // Think more, whether it is need to syncContact
    // log.verbose('PuppetPadchatBridge', 'loginSucceed: SyncContact')
    // this.WXSyncContact()
  }

  public saveConfig() {
    if (this.autoData.wxData && this.autoData.token) {
      fs.writeFileSync('./config.json', JSON.stringify(this.autoData, null, 2))
      log.verbose('PuppetPadchatBridge', 'save config file to config.json')
    } else {
      log.verbose('PuppetPadchatBridge', 'no enough data, save again, %s', JSON.stringify(this.autoData))
      setTimeout(this.saveConfig, 2 * 1000)
    }
  }
}
