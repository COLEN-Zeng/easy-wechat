const dateFormat = require('dateformat');
const constant = require('../../constant');
const uuid = require('uuid/v4');
const crypto = require('crypto');
const Xml = require('xml');
const CommonPayment = require('./common.js');
const Base = require('../base.js');

module.exports = class extends Base{
    constructor(logger, config = undefined) {
        super(logger, config);
    }

    async create({orderId, description, detail, price, tradeType, openId = undefined, spbillCreateIp = '127.0.0.1', attach =undefined,  startTime = undefined, endTime = undefined, productId = undefined, feeType = 'CNY', deviceInfo = undefined, signType = "MD5", goodsTag = undefined, limitPay = undefined, sceneInfo = undefined}){
        let nonceStr = uuid().replace(/-/g, '');
        let notifyUrl = this.config.payment.notifyUrl;
        let requestJson = {
            appid:  this.config.payment.appId,
            attach:  attach,
            body: description,
            mch_id: this.config.payment.mchId,
            detail:{_cdata:detail},
            nonce_str: nonceStr,
            notify_url: this.config.payment.notifyUrl,
            out_trade_no: orderId,
            spbill_create_ip:spbillCreateIp,
            total_fee: price,
            trade_type: tradeType,
            fee_type: feeType,
            sign_type: signType
        }
        
        if(startTime != undefined){
            requestJson.time_start = dateFormat(startTime, "yyyymmddHHMMss");
            requestJson.time_expire = dateFormat(endTime, "yyyymmddHHMMss");
        }

        if(tradeType == constant.Payment.TradeType.SCAN){
            if(productId == '') throw new Error('productId is empty');
            requestJson.product_id = productId;
        }

        if(limitPay != ''){
            requestJson.limit_pay = limitPay;
        }

        if(tradeType == constant.Payment.TradeType.JS){
            if(openId == '') throw new Error('openId is empty');
            requestJson.openid = openId;
        }

        if(sceneInfo != undefined){
            requestJson.scene_info = {
                _cdata: JSON.stringify({
                    "store_info":{
                        "id":sceneInfo.id,
                        "name":sceneInfo.name,
                        "area_code":sceneInfo.areaCode,
                        "address":sceneInfo.address,
                    }
                })
            };
        }

        if(goodsTag != '') {
            requestJson.goods_tag = goodsTag;
        }

        let common = new CommonPayment(this.logger, this.config);
        requestJson.sign = common.signGet({data: requestJson, signType});

        let xml = Object.keys(requestJson).map(key => {
            let item = {};
            item[key] = requestJson[key];
            return item;
        })
        let requestText = Xml([{xml}]);

        let response = await this.request.post
                        .url('https://api.mch.weixin.qq.com/pay/unifiedorder')
                        .xml(requestText)
                        .execute();
        
        response = this.paymentResponseJsonParse(response).xml;

        let output = {
            appId: response.appid,
            mchId: response.mch_id,
            nonceStr: response.nonce_str,
            sign: response.sign,
            resultCode: response.result_code,
            tradeType: response.trade_type,
            prepayId: response.prepay_id
        }

        if (response.code_url != undefined) output.codeUrl = response.code_url;
        if (response.device_info != undefined) output.deviceInfo = response.device_info;
        return output;
    }

    async get({wechatOrderId = undefined, orderId = undefined,  signType = "MD5"}) {
        if(wechatOrderId == undefined && orderId == undefined){
            throw new Error("empty wechatOrderId and orderId");
        }
        let nonceStr = uuid().replace(/-/g, '');
        let requestJson = {
            appid:  this.config.payment.appId,
            mch_id: this.config.payment.mchId,
            nonce_str: nonceStr,
            sign_type: signType
        }

        if(wechatOrderId != undefined){
            requestJson.transaction_id = wechatOrderId;
        }
        else {
            requestJson.out_trade_no = orderId;
        }

        let common = new CommonPayment(this.logger, this.config);
        requestJson.sign = common.signGet({data: requestJson, signType});
        
        let xml = Object.keys(requestJson).map(key => {
            let item = {};
            item[key] = requestJson[key];
            return item;
        })

        let response = await this.request.post
                        .url('https://api.mch.weixin.qq.com/pay/orderquery')
                        .xml(Xml( [{xml}]))
                        .execute();

        response = this.paymentResponseJsonParse(response).xml;

        let output = {
            appId: response.appid, 
            mchId: response.mch_id,
            nonceStr: response.nonce_str,
            sign: response.sign,
            resultCode: response.result_code,
            tradeState: response.trade_state
        }

        if (response.return_code == 'SUCCESS' && response.result_code == 'SUCCESS' && response.trade_state == 'SUCCESS') {
            output = Object.assign(output, {
                orderId: response.out_trade_no,
                openId: response.openid,
                tradeType: response.trade_type,
                bankType: response.bank_type,
                totalFee: parseInt(response.total_fee),
                cashFee: parseInt(response.cash_fee),
                wechatOrderId: response.transaction_id,
                timeEnd: response.time_end,
                tradeStateDesc: response.trade_state_desc
            })

            for (let i=0; i < 10; i++) {
                if (response[`coupon_type_${i}`] != undefined) {
                    response.coupon[i].type = output[`coupon_type_${i}`]; 
                    response.coupon[i].id = output[`coupon_id_${i}`];
                    response.coupon[i].fee = output[`coupon_fee_${i}`];
                }
                else {
                    break;
                }
            }
            
            if (response.settlement_total_fee != undefined) output.settlementTotalFee = parseInt(response.settlement_total_fee);
            if (response.fee_type != undefined) output.feeType = response.fee_type;
            if (response.cash_fee_type != undefined) output.cashFeeType = response.cash_fee_type;
            if (response.coupon_fee != undefined) output.couponFee = response.coupon_fee;
            if (response.coupon_count != undefined) output.couponCount = response.coupon_count;
            if (response.fee_type != undefined) output.feeType = response.fee_type;
            if (response.attach != undefined) output.attach = response.attach;
        }

        return output;

    }
}