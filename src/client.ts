import {Socket} from "net";
import {Buffer} from "buffer";
import {Logger} from "homebridge";


export default class Client {
    private conn: Socket;
    private authorizeCode: string = '';
    private online = false;
    private waitSwitchStatus = false;
    private _status: number = 0;
    private _batteryLevel: number = 0;
    private _weight: number = 0;

    constructor(private autologin: boolean, private readonly log: Logger) {
        this.conn = new Socket()
        this.conn.on('data', (data: Buffer) => { this.handle(data.toString('hex')) })
        this.conn.on('error', (err) => { this.debug(err.message) })
        this.conn.on('close', () => {
            this.debug("Connection Closed")
            if (this.autologin) {
                this.debug("Reconnect");
                this.connect()
            }
        })
    }

    start(authorizeCode: string) {
        this.authorizeCode = authorizeCode;
        this.connect();
    }

    // 0 关闭 1 全开 2 伸展 3 收缩
    get status(): number {
        return this._status
    }

    get batteryLevel(): number {
        return this._batteryLevel
    }

    get weight(): number {
        return this._weight
    }

    switchStatus() {
        if (!this.online) {
            if (this.conn.connecting) {
                this.login()
            } else {
                this.connect()
            }
            this.waitSwitchStatus = true
            return
        }
        this.setState('12010215')
    }

    connect() {
        this.conn.connect({host: "47.97.92.77", port: 23778}, () => {
            this.debug("Connected")
            this.login()
        });
    }

    login() {
        this.conn.write(Client.toBinary('100000001a033962e3d20010' + Client.toHex(this.authorizeCode) + '00003c'));
        if (this.waitSwitchStatus) {
            this.waitSwitchStatus = false
            this.setState('12010215')
        }
    }

    private onLogin() {
        this.debug("Client Login")
        this.online = true
        this.update()
    }

    private async update() {
        if (!this.online) {
            if (this.autologin) {
                setTimeout(() => this.login(), 30*1000)
            }
            return
        }
        await this.getState('1f') // => 11
        await this.getState('11') // => 0f
        await this.getState('10') // => 10
        setTimeout(async () => await this.update(), 3000)
    }

    private _wait: number = 0;

    private onState(type: string, msg: string) {
        this._wait -= 1;
        switch (type) {
            case '11':
                const status = msg.substr(4, 2) // 00 关闭 01 全开 02 伸展 03 收缩
                this._status = parseInt(status)
                break;
            case '0f':
                const battery = parseInt(msg.substr(0, 2), 16)
                this._batteryLevel = battery > 100 ? 100 : battery
                break;
            case '10':
                this._weight = parseInt(msg.substr(0, 4), 16)
                break;
        }
    }

    private async getState(code: string) {
        this.debug("Wait Start: " + this._wait)
        if (!await this.wait(3000)) {
            return
        }
        this.debug("Send: " + code)
        this._wait += 1;
        this.conn.write(Client.toBinary('73000000' + '0e' + '5b791a63001b0057abffff' + code + '00' + code), (err) => {
            if (err) {
                this.debug("Err: " + err)
            }
        })
        if (!await this.wait(3000)) {
            this._wait -= 1;
        }
        this.debug("Wait End: " + this._wait)
    }

    private setState(code: string) {
        this.conn.write(Client.toBinary('73000000' + '0f' + '5b791a63001b0057abffff' + code), (err) => {
            if (err) {
                this.debug("Err: " + err)
            }
        })
    }

    private handle(hex: string) {
        this.debug('HEX: ' + hex)
        if (hex === '18000000020000') {
            this.onLogin()
            return
        } else if (hex === 'e00000000103') {
            this.debug('Logout')
            this.online = false;
            return
        }

        const regexp = /83000000(\w{2})5b791a63\w{4}0057abffff\w{4}(\w{2,})/
        const match = hex.match(regexp)
        if (match) {
            this.onState(match[1], match[2])
        }
    }

    private async wait(timeout: number) {
        const duration = 100
        const retry = Math.ceil(timeout / duration)
        let i = 0
        for (; this._wait > 0 && (timeout === 0 ? true : retry > i); i++) {
            await new Promise((r) => setTimeout(r, duration))
        }
        return timeout !== 0 ? i < retry : true;
    }

    private debug(msg: string) {
        this.log.debug(msg)
    }

    private static toBinary(hex: string): Buffer {
        return Buffer.from(hex, "hex");
    }

    private static toHex(str: string): string {
        let hex = ''
        for (let i = 0; i < str.length; i++) {
            hex += str.charCodeAt(i).toString(16)
        }
        return hex
    }
}
