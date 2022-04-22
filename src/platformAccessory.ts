import {Logger, PlatformAccessory, Service} from 'homebridge';

import {HomerunPetFeederPlatform} from './platform';

import net from 'net';
import {Buffer} from 'buffer';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class HomerunPetFeederAccessory {
    private service: Service;
    private log: Logger;

    constructor(
        private readonly platform: HomerunPetFeederPlatform,
        private readonly accessory: PlatformAccessory,
    ) {

        this.log = platform.log

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
            .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

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

        /**
         * Creating multiple services of the same type.
         *
         * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
         * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
         * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
         *
         * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
         * can use the same sub type id.)
         */
    }

    async handleSwitchGet() {
        let client = new net.Socket();
        client.connect({port: 23778, host: "47.97.92.77"}, async () => {
            client.write(this.toStr(this.platform.config.token));
            client.write(this.toStr("730000000e5b791a6300d50057abffff1f001f"));
        });

        let currentValue = 0;

        client.on('data', (data: Buffer) => {
            let hex = data.toString('hex')
            const p = /83000000(\w{2})5b791a63(\w{4})0057abffff(\w{4})(\w{4})(\w{2,4})/
            if (p.test(hex)) {
                const r = hex.match(p)
                if (r !== null && r[1] === '11') {
                    client.end();
                    if (r[5] === '00a2') {
                        currentValue = 0;
                    } else {
                        currentValue = 1;
                    }
                }
            }
        });

        await new Promise(r => setTimeout(r, 2000));

        return currentValue;
    }

    handleSwitchSet(value) {
        let client = new net.Socket();
        client.connect({port: 23778, host: "47.97.92.77"}, async () => {
            client.write(this.toStr(this.platform.config.token));
            client.write(this.toStr("730000000f5b791a63001b0057abffff12010215"));
            client.end();
        });
    }

    toStr(hex): Buffer {
        return Buffer.from(hex, "hex");
    }
}
