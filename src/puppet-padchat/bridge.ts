// import Profile          from '../profile'
import { log }          from '../config'
import { EventEmitter } from 'events'
import * as cuid        from 'cuid'
import * as WebSocket   from 'ws'
import * as fs          from 'fs'
import {
  PadchatContactRawPayload,
  PadchatRoomRawPayload,
  PadchatRoomRawMember,
  PadchatRoomMemberRawPayload,
}                       from './padchat-schemas'

import {
  ADDRESS,
}                       from './config'

export const resolverDict: {
  [idx: string]: Function,
} = {}

export interface BridgeOptions {
  // head?   : boolean,
  userId:    string,
  // profile:  Profile,
  // botWs:    WebSocket,
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

export interface InitType {
  message : string,
  status  : number,
}

export interface WXInitializeType {
  message : string, // WxUserInit成功
  status  : number,
}

export interface WXAddChatRoomMemberType {
  message : string, // "\n\u0010Everything+is+OK" (succeed)  || "\n\u0014MemberList+are+wrong" ('user has in the room')
  status  : number, // 0
}

export interface WXGetQRCodeType {
  qr_code : string,
}

export interface WXCheckQRCodeType {
  device_type  ?: string,   // android,
  expired_time  : number,   // 238,
  head_url     ?: string,   // http://wx.qlogo.cn/mmhead/ver_1/NkOvv1rTx3Dsqpicnhe0j7cVOR3psEAVfuhFLbmoAcwaob4eENNZlp3KIEsMgibfH4kRjDicFFXN3qdP6SGRXbo7GBs8YpN52icxSeBUX8xkZBA/0,
  nick_name    ?: string,   // 苏轼,
  password     ?: string,
  status        : number,   // 2 = success
  user_name    ?: string,   // wxid_zj2cahpwzgie12
}

export interface WXHeartBeatType {
  status  : number,   // 0
  message : string,   // ok
}

export interface WXGenerateWxDatType {
  data    : string,   // 62data,
  message : string,   // '',
  status  : number,   // 0
}

export interface WXLoadWxDatType {
  status  : number,   // 0
  message : string,   // ok
}

export interface StandardType {
  status  : number,   // 0
  message : string,   // ''
}

export interface WXGetLoginTokenType {
  message : string,
  status  : number,   // 0,
  token   : string,   // XXXXXXXX,
  uin     : number,   // 324216852
}

export interface WXAutoLoginType {
  email              : string,
  external?          : number,   // 0,
  long_link_server?  : string,   // szlong.weixin.qq.com,
  message            : string,   // �Everything+is+ok,
  nick_name          : string,
  phone_number       : string,
  qq                 : number,   // 0,
  short_link_server? : string    // szshort.weixin.qq.com:80,
  status             : number    // 0,
  uin?               : number    // 324216852,
  user_name          : string    // wxid_zj2cahpwzgie12
}

export interface WXLoginRequestType {
  status: number // 0
}

export interface WXSendMsgType {
  message : string,
  msg_id  : string,   // '5612827783578738216',
  status  : number,   // 0
}

export interface WXQRCodeLoginType {
  email             : string,   // sushishigeshiren@163.com,
  external          : number,   // 1,
  long_link_server  : string,   // szlong.weixin.qq.com,
  message           : string,   // �Everything+is+ok,
  nick_name         : string,   // 苏轼,
  phone_number      : string,   // 17326998117,
  qq                : number,   // 0,
  short_link_server : string,   // szshort.weixin.qq.com:80,
  status            : number,   // 0,
  uin               : number,   // 324216852,
  user_name         : string,   // wxid_zj2cahpwzgie12
}

export class Bridge extends EventEmitter {
  public botWs:       WebSocket
  public userId:      string        // User Token
  public autoData:    AutoDataType

  public username:    string | undefined
  public password:    string | undefined
  public nickname:    string | undefined

  public loginSucceed = false

  constructor(
    public options: BridgeOptions,
  ) {
    super() // for EventEmitter
    log.verbose('PuppetPadchatBridge', 'constructor()')

    this.userId   = options.userId

    this.botWs  = new WebSocket(ADDRESS, { perMessageDeflate: true })

    this.autoData = options.autoData || {}
  }

  private async sendToWebSocket(name: string, args: string[]): Promise<any> {
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

  public async initWs(): Promise<void> {
    this.botWs.on('message', wsMsg => {
      this.emit('ws', wsMsg)
    })
    this.botWs.on('open', () => {
      this.emit('open')
    })
  }

  public closeWs(): void {
    this.botWs.close()
  }

  /**
   * Init with WebSocket Server
   */
  public async init(): Promise<InitType> {
    const result: InitType = await this.sendToWebSocket('init', [])
    log.silly('PuppetPadchatBridge', 'init result: %s', JSON.stringify(result))
    if (!result || result.status !== 0) {
      throw Error('cannot connect to WebSocket init')
    }
    return result
  }

  /**
   * Get WX block memory
   */
  public async WXInitialize(): Promise<WXInitializeType> {
    const result = await this.sendToWebSocket('WXInitialize', [])
    log.silly('PuppetPadchatBridge', 'WXInitialize result: %s', JSON.stringify(result))
    if (!result || result.status !== 0) {
      throw Error('cannot connect to WebSocket WXInitialize')
    }
    return result
  }

  public async WXGetQRCode(): Promise<WXGetQRCodeType> {
    let result = await this.sendToWebSocket('WXGetQRCode', [])
    if (!result || !(result.qr_code)) {
      result = await this.WXGetQRCodeTwice()
    }

    log.silly('PuppetPadchatBridge', 'WXGetQRCode get qrcode successfully')
    this.checkQrcode()
    fs.writeFileSync('./demo.jpg', result.qr_code, {encoding: 'base64'})
    return result
  }

  private async WXGetQRCodeTwice(): Promise<WXGetQRCodeType> {
    await this.WXInitialize()
    const resultTwice = await this.sendToWebSocket('WXGetQRCode', [])
    if (!resultTwice || !(resultTwice.qr_code)) {
      throw Error('WXGetQRCodeTwice error! canot get result from websocket server when calling WXGetQRCode after WXInitialize')
    }
    return resultTwice
  }

  public async WXCheckQRCode(): Promise<WXCheckQRCodeType> {
    // this.checkQrcode()
    const result = await this.sendToWebSocket('WXCheckQRCode', [])
    log.silly('PuppetPadchatBridge', 'WXCheckQRCode result: %s', JSON.stringify(result))
    if (!result) {
      throw Error('cannot connect to WebSocket WXCheckQRCode')
    }
    return result
  }

  public async WXHeartBeat(): Promise<WXHeartBeatType> {
    const result = await this.sendToWebSocket('WXHeartBeat', [])
    log.silly('PuppetPadchatBridge', 'WXHeartBeat result: %s', JSON.stringify(result))
    if (!result || result.status !== 0) {
      throw Error('WXHeartBeat error! canot get result from websocket server')
    }
    return result
  }

  // /**
  //  * Load all Contact and Room
  //  * see issue https://github.com/lijiarui/test-ipad-puppet/issues/39
  //  * @returns {Promise<(PadchatRoomRawPayload | PadchatContactRawPayload)[]>}
  //  */
  // private async WXSyncContact(): Promise<(PadchatRoomRawPayload | PadchatContactRawPayload)[]> {
  //   const result = await this.sendToWebSocket('WXSyncContact', [])
  //   if (!result) {
  //     throw Error('WXSyncContact error! canot get result from websocket server')
  //   }
  //   return result
  // }

  // public async checkSyncContactOrRoom(): Promise<{
  //   contactMap: Map<string, PadchatContactRawPayload>,
  //   roomMap: Map<string, PadchatRoomRawPayload>,
  // }> {
  //   log.silly('PuppetPadchat', `checkSyncContact`)

  //   let cont = true
  //   const syncContactMap = new Map<string, PadchatContactRawPayload>()
  //   const syncRoomMap = new Map<string, PadchatRoomRawPayload>()

  //   while (cont) {
  //     const syncContactList = await this.WXSyncContact()

  //     await new Promise(r => setTimeout(r, 3 * 1000))

  //     if (!Array.isArray(syncContactList)) {
  //       log.error('PuppetPadchat', 'checkSyncContact cannot get array result!')
  //       continue
  //     }

  //     syncContactList.forEach(syncContact => {
  //       if (syncContact.continue === 0) {
  //         log.info('PuppetPadchat', 'checkSyncContact sync contact done!')
  //         cont = false
  //         return
  //       }

  //       if (syncContact.continue === 1 && syncContact.msg_type === 2) {
  //         if (/@chatroom$/.test(syncContact.user_name)) {
  //           syncRoomMap.set(syncContact.user_name, syncContact as PadchatRoomRawPayload)
  //         } else {
  //           syncContactMap.set(syncContact.user_name, syncContact as PadchatContactRawPayload)
  //         }
  //       }
  //       return
  //     })

  //     log.info('PuppetPadchat', `checkSyncContact, not load yet, continue to WXSyncContact`)
  //   }

  //   return {
  //     contactMap: syncContactMap,
  //     roomMap: syncRoomMap,
  //   }
  // }

  /**
   * Generate 62 data
   */
  public async WXGenerateWxDat(): Promise<WXGenerateWxDatType> {
    const result = await this.sendToWebSocket('WXGenerateWxDat', [])
    log.silly('PuppetPadchatBridge', 'WXGenerateWxDat result: %s', JSON.stringify(result))
    if (!result || !(result.data) || result.status !== 0) {
      throw Error('WXGenerateWxDat error! canot get result from websocket server')
    }
    this.autoData.wxData = result.data
    return result
  }

  /**
   * Load 62 data
   * @param {string} wxData     autoData.wxData
   */
  public async WXLoadWxDat(wxData: string): Promise<WXLoadWxDatType> {
    const result = await this.sendToWebSocket('WXLoadWxDat', [wxData])
    if (!result || result.status !== 0) {
      throw Error('WXLoadWxDat error! canot get result from websocket server')
    }
    return result
  }

  public async WXGetLoginToken(): Promise<WXGetLoginTokenType> {
    const result = await this.sendToWebSocket('WXGetLoginToken', [])
    log.silly('PuppetPadchatBridge', 'WXGetLoginToken result: %s', JSON.stringify(result))
    if (!result || !result.token || result.status !== 0) {
      throw Error('WXGetLoginToken error! canot get result from websocket server')
    }
    this.autoData.token = result.token
    return result
  }

  /**
   * Login with token automatically
   * @param {string} token    autoData.token
   * @returns {string} user_name | ''
   */
  public async WXAutoLogin(token: string): Promise<WXAutoLoginType | ''> {
    const result = await this.sendToWebSocket('WXAutoLogin', [token])
    log.silly('PuppetPadchatBridge', 'WXAutoLogin result: %s, type: %s', JSON.stringify(result), typeof result)

    // should get qrcode again
    if (!result) {
      await this.WXGetQRCode()
      return ''
    }

    // should send wxloginRequest
    if (result.status !== 0) {
      await this.WXLoginRequest(token)
      return ''
    }

    // login succeed!
    this.username = result.user_name
    log.silly('PuppetPadchatBridge', 'WXAutoLogin bridge autoData user_name: %s', this.username)
    this.loginSucceed = true
    return result
  }

  /**
   * Login with QRcode
   * @param {string} token    autoData.token
   */
  public async WXLoginRequest(token: string): Promise<WXLoginRequestType | ''> {
    // TODO: should show result here
    const result = await this.sendToWebSocket('WXLoginRequest', [token])
    log.silly('PuppetPadchatBridge', 'WXLoginRequest result: %s, type: %s', JSON.stringify(result), typeof result)
    if (!result || result.status !== 0) {
      await this.WXGetQRCode()
      return ''
    } else {
      // check qrcode status
      log.silly('PuppetPadchatBridge', 'WXLoginRequest begin to check whether user has clicked confirm login')
      this.checkQrcode()
    }
    return result
  }

  /**
   * Send Text Message
   * @param {string} to       user_name
   * @param {string} content  text
   */
  public async WXSendMsg(to: string, content: string, at?: string): Promise<WXSendMsgType> {
    if (to) {
      const result = await this.sendToWebSocket('WXSendMsg', [to, content, at || ''])
      if (!result || result.status !== 0) {
        throw Error('WXSendMsg error! canot get result from websocket server')
      }
      return result
    }
    throw Error('PuppetPadchatBridge, WXSendMsg error! no to!')
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
  private async WXGetContact(id: string): Promise<PadchatContactRawPayload | PadchatRoomRawPayload> {
    const result = await this.sendToWebSocket('WXGetContact', [id])
    if (!result) {
      throw Error('PuppetPadchatBridge, WXGetContact, cannot get result from websocket server!')
    }
    if (!result.user_name) {
      log.warn('PuppetPadchatBridge', 'WXGetContact cannot get user_name, id: %s', id)
    }
    if (result.member) {
      result.member = JSON.parse(decodeURIComponent(result.member))
    }
    return result
  }

  /**
   * Get contact by contact id
   * @param {any} id        user_name
   */
  public async WXGetContactPayload(id: string): Promise<PadchatContactRawPayload> {
    if (/@chatroom$/.test(id)) {
      throw Error(`should use WXGetRoomPayload because get a room id :${id}`)
    }
    const result = await this.WXGetContact(id) as PadchatContactRawPayload
    return result
  }

  /**
   * Get contact by contact id
   * @param {any} id        user_name
   */
  public async WXGetRoomPayload(id: string): Promise<PadchatRoomRawPayload> {
    if (!(/@chatroom$/.test(id))) {
      throw Error(`should use WXGetContactPayload because get a contact id :${id}`)
    }
    const result = await this.WXGetContact(id) as PadchatRoomRawPayload
    return result
  }

  /**
   * Get room member by contact id
   * @param {any} id        chatroom_id
   */
  public async WXGetChatRoomMember(id: string): Promise<PadchatRoomMemberRawPayload> {
    const result = await this.sendToWebSocket('WXGetChatRoomMember', [id])
    if (!result) {
      throw Error('PuppetPadchatBridge, WXGetChatRoomMember, cannot get result from websocket server!')
    }
    if (!result.user_name || !result.member) {
      log.warn('PuppetPadchatBridge', 'WXGetChatRoomMember cannot get user_name or member! user_name: %s, member: %s', id, result.member)
    }

    // tslint:disable-next-line:max-line-length
    // change '[{"big_head":"http://wx.qlogo.cn/mmhead/ver_1/DpS0ZssJ5s8tEpSr9JuPTRxEUrCK0USrZcR3PjOMfUKDwpnZLxWXlD4Q38bJpcXBtwXWwevsul1lJqwsQzwItQ/0","chatroom_nick_name":"","invited_by":"wxid_7708837087612","nick_name":"李佳芮","small_head":"http://wx.qlogo.cn/mmhead/ver_1/DpS0ZssJ5s8tEpSr9JuPTRxEUrCK0USrZcR3PjOMfUKDwpnZLxWXlD4Q38bJpcXBtwXWwevsul1lJqwsQzwItQ/132","user_name":"qq512436430"},{"big_head":"http://wx.qlogo.cn/mmhead/ver_1/kcBj3gSibfFd2I9vQ8PBFyQ77cpPIfqkFlpTdkFZzBicMT6P567yj9IO6xG68WsibhqdPuG82tjXsveFATSDiaXRjw/0","chatroom_nick_name":"","invited_by":"wxid_7708837087612","nick_name":"梦君君","small_head":"http://wx.qlogo.cn/mmhead/ver_1/kcBj3gSibfFd2I9vQ8PBFyQ77cpPIfqkFlpTdkFZzBicMT6P567yj9IO6xG68WsibhqdPuG82tjXsveFATSDiaXRjw/132","user_name":"mengjunjun001"},{"big_head":"http://wx.qlogo.cn/mmhead/ver_1/3CsKibSktDV05eReoAicV0P8yfmuHSowfXAMvRuU7HEy8wMcQ2eibcaO1ccS95PskZchEWqZibeiap6Gpb9zqJB1WmNc6EdD6nzQiblSx7dC1eGtA/0","chatroom_nick_name":"","invited_by":"wxid_7708837087612","nick_name":"苏轼","small_head":"http://wx.qlogo.cn/mmhead/ver_1/3CsKibSktDV05eReoAicV0P8yfmuHSowfXAMvRuU7HEy8wMcQ2eibcaO1ccS95PskZchEWqZibeiap6Gpb9zqJB1WmNc6EdD6nzQiblSx7dC1eGtA/132","user_name":"wxid_zj2cahpwzgie12"},{"big_head":"http://wx.qlogo.cn/mmhead/ver_1/piaHuicak41b6ibmcEVxoWKnnhgGDG5EbaD0hibwkrRvKeDs3gs7XQrkym3Q5MlUeSKY8vw2FRVVstialggUxf2zic2O8CvaEsicSJcghf41nibA940/0","chatroom_nick_name":"","invited_by":"wxid_zj2cahpwzgie12","nick_name":"王宁","small_head":"http://wx.qlogo.cn/mmhead/ver_1/piaHuicak41b6ibmcEVxoWKnnhgGDG5EbaD0hibwkrRvKeDs3gs7XQrkym3Q5MlUeSKY8vw2FRVVstialggUxf2zic2O8CvaEsicSJcghf41nibA940/132","user_name":"wxid_7708837087612"}]'
    // to Array (PadchatRoomRawMember[])
    if (!Array.isArray(JSON.parse(decodeURIComponent(result.member)))) {
      log.error('PuppetPadchatBridge', 'WXGetChatRoomMember member: %s', result.member)
      throw Error('faild to parse chatroom member!')
    }
    result.member = JSON.parse(decodeURIComponent(result.member)) as PadchatRoomRawMember[]

    return result
  }

  /**
   * Login successfully by qrcode
   * @param {any} id        user_name
   * @param {any} password  password
   */
  public async WXQRCodeLogin(id: string, password: string): Promise<WXQRCodeLoginType> {
    const result = await this.sendToWebSocket('WXQRCodeLogin', [id, password])

    if (result && result.status === 0) {
      log.info('PuppetPadchatBridge', 'WXQRCodeLogin, login successfully!')
      this.username = result.user_name
      this.nickname = result.nick_name
      this.loginSucceed = true
    }

    if (result && (result.status === -3)) {
      throw Error('PuppetPadchatBridge, WXQRCodeLogin, wrong user_name or password')
    }

    if (result && (result.status === -301)) {
      log.warn('PuppetPadchatBridge', 'WXQRCodeLogin, redirect 301')

      if (!this.username || !this.password) {
        throw Error('PuppetPadchatBridge, WXQRCodeLogin, redirect 301 and cannot get username or password here, return!')
      }
      this.WXQRCodeLogin(this.username, this.password)
    }

    if (!result) {
      throw Error(`PuppetPadchatBridge, WXQRCodeLogin, unknown error, data: ${JSON.stringify(result)}`)
    }

    return result
  }

  public async checkQrcode(): Promise<void> {
    log.verbose('PuppetPadchatBridge', 'checkQrcode')
    const result = await this.WXCheckQRCode()

    if (result && result.status === 0) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Please scan the Qrcode!')

      setTimeout(() => {
        this.checkQrcode()
      }, 1000)

      return
    }

    if (result && result.status === 1) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Had scan the Qrcode, but not Login!')

      setTimeout(() => {
        this.checkQrcode()
      }, 1000)

      return
    }

    if (result && result.status === 2) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Trying to login... please wait')

      if (!result.user_name || !result.password) {
        throw Error('PuppetPadchatBridge, checkQrcode, cannot get username or password here, return!')
      }

      this.username = result.user_name
      // this.nickname = result.nick_name
      this.password = result.password

      this.WXQRCodeLogin(this.username, this.password)
      return
    }

    if (result && result.status === 3) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Timeout')
      return
    }

    if (result && result.status === 4) {
      log.info('PuppetPadchatBridge', 'checkQrcode: Cancel by user')
      return
    }

    log.warn('PuppetPadchatBridge', 'checkQrcode: not know the reason, return data: %s', JSON.stringify(result))
    return
  }

  public async WXSetUserRemark(id: string, remark: string): Promise<StandardType> {
    const result = await this.sendToWebSocket('WXSetUserRemark', [id, remark])
    log.silly('PuppetPadchatBridge', 'WXSetUserRemark result: %s', JSON.stringify(result))
    if (!result || result.status !== 0) {
      throw Error('WXSetUserRemark error! canot get result from websocket server')
    }
    return result
  }

  public async WXDeleteChatRoomMember(roomId: string, contactId: string): Promise<StandardType> {
    const result = await this.sendToWebSocket('WXDeleteChatRoomMember', [roomId, contactId])
    log.silly('PuppetPadchatBridge', 'WXDeleteChatRoomMember result: %s', JSON.stringify(result))
    if (!result || result.status !== 0) {
      throw Error('WXDeleteChatRoomMember error! canot get result from websocket server')
    }
    return result
  }

  public async WXAddChatRoomMember(roomId: string, contactId: string): Promise<boolean> {
    const result = (await this.sendToWebSocket('WXAddChatRoomMember', [roomId, contactId])) as WXAddChatRoomMemberType
    log.silly('PuppetPadchatBridge', 'WXAddChatRoomMember result: %s', JSON.stringify(result))
    if (result && result.status === -2028) {
      // result: {"message":"","status":-2028}
      // May be the owner has see not allow other people to join in the room (群聊邀请确认)
      log.warn('PuppetPadchatBridge', 'WXAddChatRoomMember failed! maybe owner open the should confirm first to invited others to join in the room.')
      return false
    }

    if (!result || result.status !== 0) {
      throw Error('WXAddChatRoomMember error! canot get result from websocket server')
    }

    // see more in WXAddChatRoomMemberType
    if (/OK/i.test(result.message)) {
      return true
    }
    return false
  }

  public async WXSetChatroomName(roomId: string, topic: string): Promise<StandardType> {
    const result = await this.sendToWebSocket('WXSetChatroomName', [roomId, topic])
    log.silly('PuppetPadchatBridge', 'WXSetChatroomName result: %s', JSON.stringify(result))
    if (!result || result.status !== 0) {
      throw Error('WXSetChatroomName error! canot get result from websocket server')
    }
    return result
  }

  // TODO
  // public async WXCreateChatRoom(userList: string[]): Promise<any> {
  //   const result = await this.sendToWebSocket('WXCreateChatRoom', userList)
  //   console.log(result)
  //   return result
  // }

  public async WXQuitChatRoom(roomId: string): Promise<StandardType> {
    const result = await this.sendToWebSocket('WXQuitChatRoom', [roomId])
    log.silly('PuppetPadchatBridge', 'WXQuitChatRoom result: %s', JSON.stringify(result))
    if (!result || result.status !== 0) {
      throw Error('WXQuitChatRoom error! canot get result from websocket server')
    }
    return result
  }

  // friendRequestSend
  // type来源值：
  // 2                 -通过搜索邮箱
  // 3                  -通过微信号搜索
  // 5                  -通过朋友验证消息
  // 7                  -通过朋友验证消息(可回复)
  // 12                -通过QQ好友添加
  // 14                -通过群来源
  // 15                -通过搜索手机号
  // 16                -通过朋友验证消息
  // 17                -通过名片分享
  // 22                -通过摇一摇打招呼方式
  // 25                -通过漂流瓶
  // 30                -通过二维码方式
  public async WXAddUser(strangerV1: string, strangerV2: string, type: string, verify: string): Promise<any> {
    // TODO:
    type = '14'
    verify = 'hello'
    const result = await this.sendToWebSocket('WXAddUser', [strangerV1, strangerV2, type, verify])
    log.silly('PuppetPadchatBridge', 'WXAddUser result: %s', JSON.stringify(result))
    return result
  }

  public async WXAcceptUser(stranger: string, ticket: string): Promise<any> {
    const result = await this.sendToWebSocket('WXAcceptUser', [stranger, ticket])
    log.silly('PuppetPadchatBridge', 'WXAcceptUser result: %s', JSON.stringify(result))
    return result
  }

}
