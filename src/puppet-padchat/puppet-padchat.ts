/**
 *   Wechaty - https://github.com/chatie/wechaty
 *
 *   @copyright 2016-2018 Huan LI <zixia@zixia.net>
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */

import * as path  from 'path'
import * as fs    from 'fs'

import {
  FileBox,
}             from 'file-box'

import {
  Message,
  MessagePayload,
}                       from '../message'

import {
  Contact,
  ContactQueryFilter,
  Gender,
  ContactType,
  ContactPayload,
}                       from '../contact'

import {
  Room,
  RoomPayload,
  RoomQueryFilter,
}                       from '../room'

// import {
//   FriendRequest,
// }                       from '../puppet/friend-request'

import {
  Puppet,
  PuppetOptions,
}                       from '../puppet/'

import {
  log,
}                       from '../config'

// import {
//   Profile,
// }                       from '../profile'

import {
  ADDRESS,
}                       from './config'

import {
  Bridge,
  resolverDict,
  AutoDataType,
}                       from './bridge'

import {
  PadchatContactRawPayload,
  PadchatMessageRawPayload,
  PadchatMessageType,
  PadchatRoomRawPayload,
}                       from './padchat-schemas'

export type PuppetFoodType = 'scan' | 'ding'
export type ScanFoodType   = 'scan' | 'login' | 'logout'

export interface RawWebSocketDataType {
  apiName: string, // raw function name: WXQRCodeLogin
  data:    string,
  msgId:   string,
  userId:  string, // token
}

import * as WebSocket from 'ws'

// Mock userid
const TOKEN = 'padchattest'

export class PuppetPadchat extends Puppet {
  public bridge:  Bridge
  public botWs:   WebSocket

  constructor(
    public options: PuppetOptions,
  ) {
    super(options)
  }

  public toString() {
    return `PuppetPadchat<${this.options.profile.name}>`
  }

  public ding(data?: any): Promise<string> {
    return data
  }

  // public initWatchdog(): void {
  //   log.verbose('PuppetPadchat', 'initWatchdogForPuppet()')

  //   const puppet = this

  //   // clean the dog because this could be re-inited
  //   this.watchdog.removeAllListeners()

  //   puppet.on('watchdog', food => this.watchdog.feed(food))
  //   this.watchdog.on('feed', food => {
  //     log.silly('PuppetPadchat', 'initWatchdogForPuppet() dog.on(feed, food={type=%s, data=%s})', food.type, food.data)
  //     // feed the dog, heartbeat the puppet.
  //     puppet.emit('heartbeat', food.data)
  //   })

  //   this.watchdog.on('reset', async (food, timeout) => {
  //     log.warn('PuppetPadchat', 'initWatchdogForPuppet() dog.on(reset) last food:%s, timeout:%s',
  //                           food.data, timeout)
  //     try {
  //       await this.stop()
  //       await this.start()
  //     } catch (e) {
  //       puppet.emit('error', e)
  //     }
  //   })
  // }

  public async start(): Promise<void> {
    // Connect with websocket server
    const botWs = this.botWs  = new WebSocket(ADDRESS, { perMessageDeflate: true })

    botWs.on('message', data => this.wsOnMessage(data))

    const bridge = this.bridge = this.initBridge('./config.json')

    log.verbose('PuppetPadchat', `start() with ${this.options.profile}`)

    this.state.on('pending')

    botWs.send(JSON.stringify({'userId': 'padchattest', 'msgId': 'cjhmao0650001d7wd6t7c5rhc', 'apiName': 'init', 'param': []}))

    // await some tasks...
    await bridge.init()
    await bridge.WXInitialize()

    // Check for 62 data, if has, then use WXLoadWxDat
    if (bridge.autoData.wxData) {
      log.info('PuppetPadchat', `start, get 62 data`)
      bridge.WXLoadWxDat(bridge.autoData.wxData)
    }

    if (bridge.autoData.token) {
      log.info('PuppetPadchat', `get ${bridge.autoData.nick_name} token`)

      // Offline, then relogin
      log.info('PuppetPadchat', `offline, trying to relogi `)
      bridge.WXAutoLogin(bridge.autoData.token)
    } else {
      bridge.WXGetQRCode()
    }

    this.state.on(true)

    // const user = this.Contact.load('logined_user_id')
    // const msg  = this.Message.createMT('padchat_id')

    // this.user = user
    // this.emit('login', user)

    // setInterval(() => {
    //   log.verbose('PuppetPadchat', `start() setInterval() pretending received a new message: ${msg}`)
    //   this.emit('message', msg)
    // }, 3000)

  }

  public initBridge(profile: string): Bridge {
    log.verbose('PuppetPadchat', 'initBridge()')
    // if (this.state.off()) {
    //   const e = new Error('initBridge() found targetState != live, no init anymore')
    //   log.warn('PuppetPadchat', e.message)
    //   throw e
    // }

    const autoData: AutoDataType = {}
    try {
      const tmpBuf = fs.readFileSync(profile)
      const data   = JSON.parse(String(tmpBuf))
      autoData.wxData = data.wxData
      autoData.token  = data.token
      log.info('PuppetPadchat', 'initBridge: get device info and auto login data: %s', JSON.stringify(autoData))
    } catch (e) {
      log.info('PuppetPadchat', 'initBridge: no device info or auto login data!')
    }

    this.bridge = new Bridge({
      token:    TOKEN,
      botWs:    this.botWs,
      autoData: autoData,
      // profile:  profile, // should be profile in the future
    })

    // this.bridge.on('ding'     , Event.onDing.bind(this))
    // this.bridge.on('error'    , e => this.emit('error', e))
    // this.bridge.on('log'      , Event.onLog.bind(this))
    // this.bridge.on('login'    , Event.onLogin.bind(this))
    // this.bridge.on('logout'   , Event.onLogout.bind(this))
    // this.bridge.on('message'  , Event.onMessage.bind(this))
    // this.bridge.on('scan'     , Event.onScan.bind(this))
    // this.bridge.on('unload'   , Event.onUnload.bind(this))

    return this.bridge
  }

  private async wsOnMessage(data: WebSocket.Data) {
    if (typeof data !== 'string') {
      const e = new Error('Ipad Websocket return wrong data!')
      log.warn('PuppetPadchat', e.message)
      throw e
    }

    log.silly('PuppetPadchat', 'get message form websocket server: %s', data)
    const rawWebSocketData = JSON.parse(data) as RawWebSocketDataType

    // Data From Tencent
    if (rawWebSocketData.msgId === '') {

      // rawWebSocketData:
      // {
      //   "apiName": "",
      //   "data": "XXXX",
      //   "msgId": "",
      //   "userId": "test"
      // }
      if (!rawWebSocketData.data) {
        log.warn('PuppetPadchat', 'WebSocket Server Error: get empty message data form Tencent server')
        return
      }

      // JSON.parse(decodeURIComponent(rawWebSocketData.data):
      // [
      //     {
      //         "content": "XXXX",
      //         "continue": 1,
      //         "data": "XXX",
      //         "description": "李佳芮+:+[语音]",
      //         "from_user": "qq512436430",
      //         "msg_id": "8502371723610127059",
      //         "msg_source": "",
      //         "msg_type": 5,
      //         "status": 1,
      //         "sub_type": 34,
      //         "timestamp": 1526984922,
      //         "to_user": "wxid_zj2cahpwzgie12",
      //         "uin": 324216852
      //     }
      // ]
      const rawData = JSON.parse(decodeURIComponent(rawWebSocketData.data))[0]

      let msg

      if (!rawData['msg_id']) {
        msg  = this.Message.createMT('emptyId')
        log.warn('PuppetPadchat', 'WebSocket Server Error: get empty message msg_id form Tencent server')
      }

      msg  = this.Message.createMT(rawData['msg_id'])
      ;
      (msg as any).payload = this.messageRawPayloadParser(rawData as PadchatMessageRawPayload)
      await msg.ready()

      this.emit('message', msg)

    // Data Return From WebSocket Client
    } else {
      log.silly('PuppetPadchat', 'return apiName: %s', rawWebSocketData.apiName)
      const msgId = rawWebSocketData.msgId

      // rawWebSocketData:
      // {
      //     "apiName": "WXHeartBeat",
      //     "data": "%7B%22status%22%3A0%2C%22message%22%3A%22ok%22%7D",
      //     "msgId": "abc231923912983",
      //     "userId": "test"
      // }
      const rawData: Object | string = JSON.parse(decodeURIComponent(rawWebSocketData.data))

      if (resolverDict[msgId]) {
        const resolve = resolverDict[msgId]
        delete resolverDict[msgId]
        resolve(rawData)
      }
    }
  }

  public async stop(): Promise<void> {
    log.verbose('PuppetPadchat', 'quit()')

    if (this.state.off()) {
      log.warn('PuppetPadchat', 'quit() is called on a OFF puppet. await ready(off) and return.')
      await this.state.ready('off')
      return
    }

    this.state.off('pending')
    // await some tasks...
    this.state.off(true)
  }

  public async logout(): Promise<void> {
    log.verbose('PuppetPadchat', 'logout()')

    if (!this.logonoff()) {
      throw new Error('logout before login?')
    }

    // this.emit('logout', this.user!) // becore we will throw above by logonoff() when this.user===undefined
    // this.user = undefined

    // TODO: do the logout job
  }

  /**
   *
   * Contact
   *
   */
  public contactAlias(contact: Contact)                      : Promise<string>
  public contactAlias(contact: Contact, alias: string | null): Promise<void>

  public async contactAlias(contact: Contact, alias?: string|null): Promise<void | string> {
    log.verbose('PuppetPadchat', 'contactAlias(%s, %s)', contact, alias)

    if (typeof alias === 'undefined') {
      return 'padchat alias'
    }
    return
  }

  public async contactFindAll(query: ContactQueryFilter): Promise<Contact[]> {
    log.verbose('PuppetPadchat', 'contactFindAll(%s)', query)

    // If not founs, WXSyncContact to load all contact

    // If still not found, return []

    return []
  }

  public async contactAvatar(contact: Contact): Promise<FileBox> {
    log.verbose('PuppetPadchat', 'contactAvatar(%s)', contact)

    const WECHATY_ICON_PNG = path.resolve('../../docs/images/wechaty-icon.png')
    return FileBox.fromLocal(WECHATY_ICON_PNG)
  }

  public async contactRawPayload(id: string): Promise<PadchatContactRawPayload> {
    log.verbose('PuppetPadchat', 'contactRawPayload(%s)', id)

    const rawPayload: PadchatContactRawPayload = {
      big_head :  'padchat name',
      city:       '',
      country:    '',
      nick_name:  '',
      provincia:  '',
      remark:     '',
      sex:        1,
      signature:  '',
      small_head: '',
      stranger:   '',
      user_name:  '',
    }
    return rawPayload
  }

  public async contactRawPayloadParser(rawPayload: PadchatContactRawPayload): Promise<ContactPayload> {
    log.verbose('PuppetPadchat', 'contactRawPayloadParser(%s)', rawPayload)

    const payload: ContactPayload = {
      gender: Gender.Unknown,
      type:   ContactType.Unknown,
    }
    return payload
  }

  /**
   *
   * Message
   *
   */
  public async messageRawPayload(id: string): Promise<PadchatMessageRawPayload> {
    log.verbose('PuppetPadchat', 'messageRawPayload(%s)', id)
    const rawPayload: PadchatMessageRawPayload = {
      content:      '',
      data:         '',
      continue:     1,
      description:  '',
      from_user:    '',
      msg_id:       '',
      msg_source:   '',
      msg_type:     5,
      status:       1,
      sub_type:     PadchatMessageType.TEXT,
      timestamp:    11111111,
      to_user:      '',
      uin:          111111,

      // from : 'from_id',
      // text : 'padchat message text',
      // to   : 'to_id',
    }
    return rawPayload
  }

  public async messageRawPayloadParser(rawPayload: PadchatMessageRawPayload): Promise<MessagePayload> {
    log.verbose('PuppetPadchat', 'messagePayload(%s)', rawPayload)
    const payload: MessagePayload = {
      date      : new Date(),
      direction : this.Message.Direction.MT,
      from      : this.Contact.load('xxx'),
      text      : 'padchat message text',
      to        : this.userSelf(),
      type      : this.Message.Type.Text,
    }
    return payload
  }

  public async messageSend(message: Message): Promise<void> {
    log.verbose('PuppetPadchat', 'messageSend(%s)', message)
  }

  public async messageForward(message: Message, to: Contact | Room): Promise<void> {
    log.verbose('PuppetPadchat', 'messageForward(%s, %s)',
                              message,
                              to,
              )
  }

  /**
   *
   * Room
   *
   */
  public async roomRawPayload(id: string): Promise<PadchatRoomRawPayload> {
    log.verbose('PuppetPadchat', 'roomRawPayload(%s)', id)

    const rawPayload: PadchatRoomRawPayload = {
      big_head:         '',
      bit_mask:         4294967295,
      bit_value:        2050,
      chatroom_id:      700000154,
      chatroom_owner:   '',
      continue:         1,
      max_member_count: 500,
      member:           [],
      member_count:     4,
      msg_type:         2,
      nick_name:        '',
      small_head:       '',
      status:           1,
      uin:              324216852,
      user_name:        '',

      // owner      : 'padchat_room_owner_id',
      // topic      : 'padchat topic',
      // memberList : [],
    }
    return rawPayload
  }

  public async roomRawPayloadParser(rawPayload: PadchatRoomRawPayload): Promise<RoomPayload> {
    log.verbose('PuppetPadchat', 'roomRawPayloadParser(%s)', rawPayload)

    const payload: RoomPayload = {
      topic          : 'padchat topic',
      memberList     : [],
      nameMap        : {} as any,
      roomAliasMap   : {} as any,
      contactAliasMap: {} as any,
    }

    return payload
  }

  public async roomFindAll(
    query: RoomQueryFilter = { topic: /.*/ },
  ): Promise<Room[]> {
    log.verbose('PuppetPadchat', 'roomFindAll(%s)', query)

    return []
  }

  public async roomDel(
    room    : Room,
    contact : Contact,
  ): Promise<void> {
    log.verbose('PuppetPadchat', 'roomDel(%s, %s)', room, contact)
  }

  public async roomAdd(
    room    : Room,
    contact : Contact,
  ): Promise<void> {
    log.verbose('PuppetPadchat', 'roomAdd(%s, %s)', room, contact)
  }

  public async roomTopic(room: Room, topic?: string): Promise<void | string> {
    log.verbose('PuppetPadchat', 'roomTopic(%s, %s)', room, topic)

    if (typeof topic === 'undefined') {
      return 'padchat room topic'
    }
    return
  }

  public async roomCreate(contactList: Contact[], topic: string): Promise<Room> {
    log.verbose('PuppetPadchat', 'roomCreate(%s, %s)', contactList, topic)

    if (!contactList || ! contactList.map) {
      throw new Error('contactList not found')
    }
    const r = this.Room.load('padchat room id') as Room
    return r
  }

  public async roomQuit(room: Room): Promise<void> {
    log.verbose('PuppetPadchat', 'roomQuit(%s)', room)
  }

  /**
   *
   *
   * FriendRequest
   *
   */
  public async friendRequestSend(contact: Contact, hello: string): Promise<void> {
    log.verbose('PuppetPadchat', 'friendRequestSend(%s, %s)', contact, hello)
  }

  public async friendRequestAccept(contact: Contact, ticket: string): Promise<void> {
    log.verbose('PuppetPadchat', 'friendRequestAccept(%s, %s)', contact, ticket)
  }

}

export default PuppetPadchat
