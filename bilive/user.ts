import * as request from 'request'
import * as tools from './lib/tools'
import { AppClient } from './lib/app_client'
import { apiLiveOrigin, _options, liveOrigin, _user } from './index'
/**
 * Creates an instance of User.
 * 
 * @export
 * @class User
 * @extends {AppClient}
 */
export class User extends AppClient {
  /**
   * Creates an instance of User.
   * @param {string} uid 
   * @param {userData} userData 
   * @memberof User
   */
  constructor(uid: string, userData: userData) {
    super()
    this.uid = uid
    this.userData = userData
  }
  // 存储用户信息
  public uid: string
  public userData: userData
  public get nickname(): string { return this.userData.nickname }
  public get userName(): string { return this.userData.userName }
  public set userName(userName: string) { this.userData.userName = userName }
  public get passWord(): string { return this.userData.passWord }
  public set passWord(passWord: string) { this.userData.passWord = passWord }
  public get biliUID(): number { return this.userData.biliUID }
  public set biliUID(biliUID: number) { this.userData.biliUID = biliUID }
  public get accessToken(): string { return this.userData.accessToken }
  public set accessToken(accessToken: string) { this.userData.accessToken = accessToken }
  public get refreshToken(): string { return this.userData.refreshToken }
  public set refreshToken(refreshToken: string) { this.userData.refreshToken = refreshToken }
  public get cookieString(): string { return this.userData.cookie }
  public set cookieString(cookieString: string) { this.userData.cookie = cookieString }
  public jar: request.CookieJar
  // 用户状态
  private _sign = false
  private _treasureBox = false
  private _eventRoom = false
  private _silver2coin = false
  // 验证码
  public captchaJPEG = ''
  /**
   * 如果抽奖做到外面的话应该有用
   * 
   * @readonly
   * @memberof User
   */
  public get tokenQuery() {
    return `access_key=${this.accessToken}`
  }
  /**
   * 负责心跳定时
   * 
   * @private
   * @type {NodeJS.Timer}
   * @memberof User
   */
  private _heartTimer: NodeJS.Timer
  /**
   * 当账号出现异常时, 会返回'captcha'或'stop'
   * 'captcha'为登录需要验证码, 若无法处理需Stop()
   * 
   * @returns {(Promise<'captcha' | 'stop' | void>)} 
   * @memberof User
   */
  public async Start(): Promise<'captcha' | 'stop' | void> {
    clearTimeout(this._heartTimer)
    if (!_user.has(this.uid)) _user.set(this.uid, this)
    if (this.jar == null) {
      await this.init()
      this.jar = tools.setCookie(this.cookieString)
    }
    let test = await this.getUserInfo()
    if (typeof test === 'string') return test
    this._heartLoop()
  }
  /**
   * 停止挂机
   * 
   * @memberof User
   */
  public Stop() {
    clearTimeout(this._heartTimer)
    _user.delete(this.uid)
    this.userData.status = false
    tools.Options(_options)
  }
  /**
   * 零点重置
   * 为了少几个定时器, 统一由外部调用
   * 
   * @memberof User
   */
  public nextDay() {
    this._sign = false
    this._treasureBox = false
    this._eventRoom = false
    this._silver2coin = false
  }
  /**
   * 检查是否登录
   * 
   * @private
   * @returns {(Promise<'captcha' | 'stop' | void>)} 
   * @memberof User
   */
  public async getUserInfo(roomID = _options.config.defaultRoomID): Promise<'captcha' | 'stop' | void> {
    let isLogin = await tools.XHR<{ code: number | string }>({
      uri: 'https://live.bilibili.com/user/getuserinfo',
      jar: this.jar,
      json: true,
      headers: { 'Referer': `${liveOrigin}/${roomID}` }
    }).catch(tools.Error)
    if (isLogin != null && isLogin.response.statusCode === 200 && isLogin.body.code === -101) return this._cookieError()
  }
  /**
   * 设置心跳循环
   * 
   * @private
   * @memberof User
   */
  private async _heartLoop() {
    let heartTest = await this._onlineHeart().catch(tools.Error)
    if (typeof heartTest === 'string') {
      let test = await this._cookieError()
      if (test === 'captcha') this.Stop()
    }
    else {
      this._heartTimer = setTimeout(() => {
        this._heartLoop()
      }, 3e+5) // 5min
    }
  }
  /**
   * 发送在线心跳包
   * 
   * @private
   * @returns {(Promise<'cookieError' | 'tokenError' | void>)} 
   * @memberof User
   */
  private async _onlineHeart(): Promise<'cookieError' | 'tokenError' | void> {
    let online: request.Options = {
      method: 'POST',
      uri: `${apiLiveOrigin}/User/userOnlineHeart`,
      jar: this.jar,
      json: true,
      headers: { 'Referer': `${liveOrigin}/${_options.config.defaultRoomID}` }
    }
      , heartPC = await tools.XHR<userOnlineHeart>(online)
    if (heartPC.response.statusCode === 200 && heartPC.body.code === 3) return 'cookieError'
    // 客户端
    let heartbeat: request.Options = {
      method: 'POST',
      uri: `${apiLiveOrigin}/mobile/userOnlineHeart?${AppClient.signQueryBase(this.tokenQuery)}`,
      body: `room_id=${_options.config.defaultRoomID}&scale=xxhdpi`,
      json: true,
      headers: this.headers
    }
      , heart = await tools.XHR<userOnlineHeart>(heartbeat, 'Android')
    if (heart.response.statusCode === 200 && heart.body.code === 3) return 'tokenError'
  }
  /**
   * cookie失效
   * 
   * @private
   * @returns {(Promise<'captcha' | 'stop' | void>)} 
   * @memberof User
   */
  private async _cookieError(): Promise<'captcha' | 'stop' | void> {
    tools.Log(this.nickname, 'Cookie已失效')
    let refresh = await this.refresh()
    if (refresh.status === AppClient.status.success) {
      this.jar = tools.setCookie(this.cookieString)
      await this.getUserInfo()
      await tools.Options(_options)
      this._heartLoop()
      tools.Log(this.nickname, 'Cookie已更新')
    }
    else return this._tokenError()
  }
  /**
   * token失效
   * 
   * @private
   * @returns {(Promise<'captcha' | 'stop' | void>)} 
   * @memberof User
   */
  private async _tokenError(): Promise<'captcha' | 'stop' | void> {
    tools.Log(this.nickname, 'Token已失效')
    let login = await this.login()
    if (login.status === AppClient.status.success) {
      clearTimeout(this._heartTimer)
      this.captchaJPEG = ''
      this.jar = tools.setCookie(this.cookieString)
      await this.getUserInfo()
      await tools.Options(_options)
      this._heartLoop()
      tools.Log(this.nickname, 'Token已更新')
    }
    else if (login.status === AppClient.status.captcha) {
      let captcha = await this.getCaptcha()
      if (captcha.status === AppClient.status.success) this.captchaJPEG = `data:image/jpeg;base64,${captcha.data.toString('base64')}`
      this._heartTimer = setTimeout(() => this.Stop(), 6e+4) // 60s
      tools.Log(this.nickname, '验证码错误')
      return 'captcha'
    }
    else if (login.status === AppClient.status.error) {
      this.Stop()
      tools.Log(this.nickname, 'Token更新失败', login.data)
      return 'stop'
    }
    else tools.Log(this.nickname, 'Token更新失败')
  }
  /**
   * 日常
   * 
   * @memberof User
   */
  public async daily() {
    await this.sign().catch(error => { tools.Error(this.nickname, '每日签到', error) })
    this.treasureBox().catch(error => { tools.Error(this.nickname, '每日宝箱', error) })
    this.eventRoom().catch(error => { tools.Error(this.nickname, '每日任务', error) })
    this.silver2coin().catch(error => { tools.Error(this.nickname, '银瓜子兑换硬币', error) })
    this.sendGift().catch(error => { tools.Error(this.nickname, '自动送礼', error) })
    this.signGroup().catch(error => { tools.Error(this.nickname, '应援团签到', error) })
  }
  /**
   * 每日签到
   * 
   * @memberof User
   */
  public async sign() {
    if (this._sign || !this.userData.doSign) return
    let ok = 0
    // 签到
    let sign: request.Options = {
      uri: `${apiLiveOrigin}/AppUser/getSignInfo?${AppClient.signQueryBase(this.tokenQuery)}`,
      json: true,
      headers: this.headers
    }
      , signInfo = await tools.XHR<signInfo>(sign, 'Android')
    if (signInfo.response.statusCode === 200 && signInfo.body.code === 0) {
      ok += 1
      tools.Log(this.nickname, '每日签到', '已签到')
    }
    // 道具包裹
    let getBag: request.Options = {
      uri: `${apiLiveOrigin}/AppBag/getSendGift?${AppClient.signQueryBase(this.tokenQuery)}`,
      json: true,
      headers: this.headers
    }
      , getBagGift = await tools.XHR<getBagGift>(getBag, 'Android')
    if (getBagGift.response.statusCode === 200 && getBagGift.body.code === 0) {
      ok += 1
      tools.Log(this.nickname, '每日签到', '已获取每日包裹')
    }
    if (ok === 2) this._sign = true
  }
  /**
   * 每日宝箱
   * 
   * @memberof User
   */
  public async treasureBox() {
    if (this._treasureBox || !this.userData.treasureBox) return
    // 获取宝箱状态,换房间会重新冷却
    let current: request.Options = {
      uri: `${apiLiveOrigin}/mobile/freeSilverCurrentTask?${AppClient.signQueryBase(this.tokenQuery)}`,
      json: true,
      headers: this.headers
    }
      , currentTask = await tools.XHR<currentTask>(current, 'Android')
    if (currentTask.response.statusCode === 200) {
      if (currentTask.body.code === 0) {
        await tools.Sleep(currentTask.body.data.minute * 6e4)
        let award: request.Options = {
          uri: `${apiLiveOrigin}/mobile/freeSilverAward?${AppClient.signQueryBase(this.tokenQuery)}`,
          json: true,
          headers: this.headers
        }
        await tools.XHR<award>(award, 'Android')
        this.treasureBox()
      }
      else if (currentTask.body.code === -10017) {
        this._treasureBox = true
        tools.Log(this.nickname, '每日宝箱', '已领取所有宝箱')
      }
    }
  }
  /**
   * 每日任务
   * 
   * @memberof User
   */
  public async eventRoom() {
    if (this._eventRoom || !this.userData.eventRoom) return
    // 分享房间
    let roomID = _options.config.eventRooms[0]
      , biliUID = this.biliUID
      , md5 = tools.Hash('md5', `${biliUID}${roomID}bilibili`)
      , sha1 = tools.Hash('sha1', `${md5}bilibili`)
      , share: request.Options = {
        uri: `${apiLiveOrigin}/activity/v1/Common/shareCallback?${AppClient.signQueryBase(`roomid=${roomID}\
&sharing_plat=weibo&share_sign=${sha1}&${this.tokenQuery}`)}`,
        json: true,
        headers: this.headers
      }
    let shareCallback = await tools.XHR<shareCallback>(share, 'Android')
    if (shareCallback.response.statusCode === 200 && shareCallback.body.code === 0)
      tools.Log(this.nickname, '每日任务', `分享房间 ${roomID} 成功`)
    else tools.Log(this.nickname, '每日任务', shareCallback.body.msg)
    // 做任务
    let ok = 0
      , task = ['single_watch_task', 'double_watch_task', 'share_task']
    task.forEach(value => {
      let task: request.Options = {
        method: 'POST',
        uri: `${apiLiveOrigin}/activity/v1/task/receive_award`,
        body: `task_id=${value}`,
        jar: this.jar,
        json: true,
        headers: { 'Referer': `${liveOrigin}/${roomID}` }
      }
      tools.XHR(task, 'WebView')
        .then(taskres => {
          if (taskres.response.statusCode === 200) ok += 1
          if (ok = 3) this._eventRoom = true
        })
        .catch(error => { tools.Error(this.nickname, '每日任务', error) })
    })
  }
  /**
   * 银瓜子兑换硬币
   * 
   * @memberof User
   */
  public async silver2coin() {
    if (this._silver2coin || !this.userData.silver2coin) return
    let exchange: request.Options = {
      method: 'POST',
      uri: `${apiLiveOrigin}/AppExchange/silver2coin?${AppClient.signQueryBase(this.tokenQuery)}`,
      json: true,
      headers: this.headers
    }
      , silver2coin = await tools.XHR<silver2coin>(exchange, 'Android')
    if (silver2coin.response.statusCode === 200 && silver2coin.body.code === 0) {
      this._silver2coin = true
      tools.Log(this.nickname, '银瓜子兑换硬币', '成功兑换 1 个硬币')
    }
    else if (silver2coin.response.statusCode === 200 && silver2coin.body.code === 403) {
      this._silver2coin = true
      tools.Log(this.nickname, '银瓜子兑换硬币', silver2coin.body.msg)
    }
    else tools.Log(this.nickname, '银瓜子兑换硬币', '兑换失败', silver2coin.body)
  }
  /**
   * 自动送礼
   * 
   * @memberof User
   */
  public async sendGift() {
    if (!this.userData.sendGift) return
    let roomID = this.userData.sendGiftRoom
      // 获取房间信息
      , room: request.Options = {
        uri: `${apiLiveOrigin}/AppRoom/index?${AppClient.signQueryBase(`room_id=${roomID}`)}`,
        json: true
      }
      , roomInfo = await tools.XHR<roomInfo>(room, 'Android')
    if (roomInfo.response.statusCode === 200 && roomInfo.body.code === 0) {
      // masterID
      let mid = roomInfo.body.data.mid
        , room_id = roomInfo.body.data.room_id
        // 获取包裹信息
        , bag: request.Options = {
          uri: `${apiLiveOrigin}/gift/v2/gift/m_bag_list?${AppClient.signQueryBase(this.tokenQuery)}`,
          json: true,
          headers: this.headers
        }
        , bagInfo = await tools.XHR<bagInfo>(bag, 'Android')
      if (bagInfo.response.statusCode === 200 && bagInfo.body.code === 0) {
        if (bagInfo.body.data.length > 0) {
          for (let giftData of bagInfo.body.data) {
            // 永久礼物expireat值为0
            if (giftData.expireat > 0 && giftData.expireat < 8.64e+4) /* 24h */ {
              // 送出礼物
              let send: request.Options = {
                method: 'POST',
                uri: `${apiLiveOrigin}/gift/v2/live/bag_send`,
                body: AppClient.signQueryBase(`bag_id=${giftData.id}&biz_code=live&biz_id=${room_id}&gift_id=${giftData.gift_id}\
&gift_num=${giftData.gift_num}&ruid=${mid}&uid=${giftData.uid}&rnd=${AppClient.RND}&${this.tokenQuery}`),
                json: true,
                headers: this.headers
              }
                , sendBag = await tools.XHR<sendBag>(send, 'Android')
              if (sendBag.response.statusCode === 200 && sendBag.body.code === 0) {
                let sendBagData = sendBag.body.data
                tools.Log(this.nickname, '自动送礼', `向房间 ${roomID} 赠送 ${sendBagData.gift_num} 个${sendBagData.gift_name}`)
              }
              else tools.Log(this.nickname, '自动送礼', `向房间 ${roomID} 赠送 ${giftData.gift_num} 个${giftData.gift_name} 失败`, sendBag.body)
              await tools.Sleep(3e+3) //3s
            }
          }
        }
      }
      else tools.Log(this.nickname, '自动送礼', '获取包裹信息失败', bagInfo.body)
    }
    else tools.Log(this.nickname, '自动送礼', '获取房间信息失败', roomInfo.body)
  }
  /**
   * 应援团签到
   * 
   * @memberof User
   */
  public async signGroup() {
    if (!this.userData.signGroup) return
    // 获取已加入应援团列表
    let group: request.Options = {
      uri: `${apiLiveOrigin}/link_group/v1/member/my_groups?${AppClient.signQueryBase(this.tokenQuery)}`,
      json: true,
      headers: this.headers
    }
      , linkGroup = await tools.XHR<linkGroup>(group, 'Android')
    if (linkGroup.response.statusCode === 200 && linkGroup.body.code === 0) {
      if (linkGroup.body.data.list.length > 0) {
        for (let groupInfo of linkGroup.body.data.list) {
          // 应援团自动签到
          let sign: request.Options = {
            uri: `${apiLiveOrigin}/link_setting/v1/link_setting/sign_in?${AppClient.signQueryBase(`group_id=${groupInfo.group_id}\
&owner_id=${groupInfo.owner_uid}&${this.tokenQuery}`)}`,
            json: true,
            headers: this.headers
          }
            , signGroup = await tools.XHR<signGroup>(sign, 'Android')
          if (signGroup.response.statusCode === 200 && signGroup.body.data.add_num > 0)
            tools.Log(this.nickname, '应援团签到', `在${groupInfo.group_name}签到获得 ${signGroup.body.data.add_num} 点亲密度`)
          else tools.Log(this.nickname, '应援团签到', `已在${groupInfo.group_name}签到过`)
          await tools.Sleep(3e+3) //3s
        }
      }
    }
    else tools.Log(this.nickname, '应援团签到', '获取应援团列表失败', linkGroup.body)
  }
}