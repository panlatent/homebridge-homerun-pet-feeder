import {Logger, PlatformAccessory, Service} from 'homebridge';

import {HomerunPetFeederPlatform} from './platform';
import Client from './client'
import axios from 'axios';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class HomerunPetFeederAccessory {

    private service: Service;
    private batteryService: Service;
    private log: Logger;
    private client: Client;

    constructor(
        private readonly platform: HomerunPetFeederPlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        this.log = platform.log
        this.client = new Client(this.log)
        this.auth().then(async () => {
            this.client.start(await this.authorize())
        })

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Homerun')
            .setCharacteristic(this.platform.Characteristic.Model, 'C2C(130391398)')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, '130391398');

        // get the LightBulb service if it exists, otherwise create a new LightBulb service
        // you can create multiple services for each accessory
        this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName);

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/Lightbulb

        // create handlers for required characteristics
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.handleSwitchGet.bind(this))
            .onSet(this.handleSwitchSet.bind(this));

        this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)
        this.batteryService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName)
        this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
            .onGet(this.handleBatteryLevelGet.bind(this))
        this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState)
            .onGet(this.handleChargingStateGet.bind(this))
    }

    async handleSwitchGet() {
        return this.client.status !== 0
    }

    async handleSwitchSet(value) {
        this.client.switchStatus()
    }

    async handleBatteryLevelGet() {
        return this.client.batteryLevel
    }

    async handleChargingStateGet() {
        const data = await this.get('https://api2.xlink.cn/v2/user/' + (await this.userId()).toString() + '/subscribe/devices')
        for (const i in data) {
            if (data[i].product_id === '160fa2af31428e00160fa2af31428e01') {
                return data[i].is_online
            }
        }
        return 0;
    }

    private authInfo: any

    async accessToken() {
        if (!this.authInfo) {
            await this.auth()
        }
        return this.authInfo.access_token;
    }

    async authorize() {
        if (!this.authInfo) {
            await this.auth()
        }
        return this.authInfo.authorize;
    }

    async userId() {
        if (!this.authInfo) {
            await this.auth()
        }
        return this.authInfo.user_id;
    }

    private async auth() {
        const res = await axios.post('https://api2.xlink.cn/v2/user_auth', {
            corp_id: '100fa2af234d2400',
            phone: this.platform.config.username,
            password: this.platform.config.password
        })

        this.authInfo = res.data
    }

    async get(url: string) {
        let res = await axios.get(url, {
            headers: {
                'Access-Token': await this.accessToken(),
            }
        })

        if (res.status === 403) {
            await this.auth()
            res = await axios.get(url, {
                headers: {
                    'Access-Token': await this.accessToken(),
                }
            })
        }

        return res.data
    }
}
