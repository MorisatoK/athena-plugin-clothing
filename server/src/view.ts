import * as alt from 'alt-server';
import { Athena } from '@AthenaServer/api/athena';
import { PolygonShape } from '@AthenaServer/extensions/extColshape';
import { ITEM_TYPE } from '@AthenaShared/enums/itemTypes';
import { Blip } from '@AthenaShared/interfaces/blip';
import { ClothingComponent } from '@AthenaShared/interfaces/clothing';
import { Interaction } from '@AthenaShared/interfaces/interaction';
import { Item } from '@AthenaShared/interfaces/item';
import { LOCALE_KEYS } from '@AthenaShared/locale/languages/keys';
import { LocaleController } from '@AthenaShared/locale/locale';
import { CLOTHING_CONFIG } from '../../shared/config';
import { CLOTHING_STORE_PAGE, DLC_CLOTH_HASH } from '../../shared/enums';
import { CLOTHING_INTERACTIONS } from '../../shared/events';
import { CLOTHING_DLC_INFO, IClothingStore } from '../../shared/interfaces';
import { ComponentVueInfo } from '../../shared/types';
import clothingStores from './stores';

// Do not change order
const icons = [
    'hat',
    'mask',
    'shirt',
    'bottoms',
    'shoes',
    'glasses',
    'ear',
    'backpack',
    'armour',
    'watch',
    'bracelet',
    'accessory',
];

const wearableRef: Item = {
    name: `Item`,
    description: `An Item`,
    icon: 'crate',
    slot: 0,
    quantity: 1,
    behavior: ITEM_TYPE.CAN_DROP | ITEM_TYPE.CAN_TRADE | ITEM_TYPE.IS_EQUIPMENT,
    data: {},
};

const DefaultClothingData: IClothingStore = {
    hiddenComponents: {},
    hiddenPages: [],
    pagePrices: {
        [CLOTHING_STORE_PAGE.ARMOUR]: 1000,
        [CLOTHING_STORE_PAGE.BAG]: 125,
        [CLOTHING_STORE_PAGE.BOTTOMS]: 25,
        [CLOTHING_STORE_PAGE.BRACELET]: 5,
        [CLOTHING_STORE_PAGE.EARRINGS]: 5,
        [CLOTHING_STORE_PAGE.GLASSES]: 50,
        [CLOTHING_STORE_PAGE.HATS]: 75,
        [CLOTHING_STORE_PAGE.MASK]: 250,
        [CLOTHING_STORE_PAGE.SHIRT]: 25,
        [CLOTHING_STORE_PAGE.SHOES]: 25,
        [CLOTHING_STORE_PAGE.WATCH]: 200,
        [CLOTHING_STORE_PAGE.ACCESSORY]: 50,
    },
    clothingPrices: {},
};

let clothingStoreList: Array<IClothingStore> = [];
let isClothingStoresReady = false;

export class ClothingFunctions {
    /**
     * Initializes all clothing stores on server-start.
     * @static
     * @memberof ClothingFunctions
     */
    static init() {
        for (let i = 0; i < clothingStores.length; i++) {
            const position = clothingStores[i];
            const uid = `clothing-store-${i}`;

            // Do not change.
            const defaultBlip: Blip = {
                text: 'Clothing Store',
                color: 11,
                sprite: 73,
                scale: 1,
                shortRange: true,
                pos: position,
                uid,
            };

            // Do not change.
            const defaultInteraction: Interaction = {
                position,
                description: 'Browse Clothing Store',
            };

            if (clothingStores[i].vertices) {
                const polygon = new PolygonShape(position.z, position.z + 2.5, clothingStores[i].vertices, true, false);

                polygon.addEnterCallback(ClothingFunctions.enter);
                polygon.addLeaveCallback(ClothingFunctions.leave);
                polygon.isPlayerOnly = true;
            }

            const clothingData = Athena.utility.deepCloneObject<IClothingStore>(DefaultClothingData);
            clothingData.uid = uid;

            ClothingFunctions.create(
                position,
                clothingData,
                Athena.utility.deepCloneObject(defaultBlip),
                Athena.utility.deepCloneObject(defaultInteraction),
                clothingStores[i].isBlip,
            );
        }

        isClothingStoresReady = true;
    }

    /**
     * Used to create dynamic clothing stores.
     * @static
     * @param {IClothingStore} store
     * @memberof ClothingFunctions
     */
    static create(
        position: alt.IVector3,
        store: IClothingStore,
        blip: Blip,
        interaction: Interaction,
        createBlip: boolean,
    ) {
        if (!store.uid) {
            store.uid = Athena.utility.hash.sha256(JSON.stringify(store));
        }

        blip.uid = store.uid;
        blip.pos = position;
        interaction.position = {
            x: position.x,
            y: position.y,
            z: position.z - 1,
        };
        interaction.isPlayerOnly = true;
        interaction.callback = (player: alt.Player) => {
            const data = ClothingFunctions.getClothingStoreData(store.uid);
            alt.emitClient(player, CLOTHING_INTERACTIONS.OPEN, data, player.data.appearance, player.data.equipment);
        };

        if (createBlip) {
            Athena.controllers.blip.append(blip);
        }
        Athena.controllers.interaction.add(interaction);
        clothingStoreList.push(store);
    }

    /**
     * Used to get the clothing store data and pass it down to the player.
     * @static
     * @param {string} uid
     * @return {*}
     * @memberof ClothingFunctions
     */
    static getClothingStoreData(uid: string): IClothingStore {
        const index = clothingStoreList.findIndex((x) => x.uid === uid);
        if (index <= -1) {
            return null;
        }

        return clothingStoreList[index];
    }

    /**
     * Used to override default clothing store data.
     * @static
     * @param {string} uid
     * @param {IClothingStore} data
     * @return {*}
     * @memberof ClothingFunctions
     */
    static async overrideClothingData(uid: string, data: IClothingStore) {
        await this.waitForReady();
        const index = clothingStoreList.findIndex((x) => x.uid === uid);
        if (index <= -1) {
            console.error(new Error(`Clothing store with ${uid} does not exist.`));
            return;
        }

        data.uid = clothingStoreList[index].uid;
        clothingStoreList[index] = data;
    }

    /**
     * Used to wait for the clothing store to be ready before
     * overriding any data.
     * @private
     * @static
     * @return {*}  {Promise<void>}
     * @memberof ClothingFunctions
     */
    private static waitForReady(): Promise<void> {
        return new Promise((resolve: Function) => {
            const interval = alt.setInterval(() => {
                if (!isClothingStoresReady) {
                    return;
                }

                alt.clearInterval(interval);
                return resolve();
            }, 100);
        });
    }

    /**
     * Forces re-synchronization so that the player's equipment and clothing
     * are set to what they currently have equipped after leaving.
     * @static
     * @param {alt.Player} player
     * @memberof ClothingFunctions
     */
    static exit(player: alt.Player) {
        Athena.player.sync.inventory(player);
    }

    /**
     * Returns a string if it's non-gtav based hash.
     *
     * @static
     * @param {number} sex
     * @param {number} id
     * @param {number} drawable
     * @param {boolean} [isProp=false]
     * @return {*}
     * @memberof ClothingFunctions
     */
    static getDlcHash(
        player: alt.Player,
        id: number,
        drawable: number,
        texture: number,
        isProp: boolean = false,
    ): { dlcName: string | number; drawable: number; texture: number } {
        if (!player || !player.valid) {
            return null;
        }

        const defaultMaxSize = isProp
            ? CLOTHING_CONFIG.MAXIMUM_PROP_VALUES[player.data.appearance.sex][id]
            : CLOTHING_CONFIG.MAXIMUM_COMPONENT_VALUES[player.data.appearance.sex][id];

        if (drawable <= defaultMaxSize) {
            const dlcData = isProp ? player.getDlcProp(id) : player.getDlcClothes(id);
            return {
                dlcName: this.mapDlcHash(dlcData.dlc),
                drawable: this.mapDlcDrawable(dlcData.dlc, dlcData.drawable),
                texture: dlcData.texture,
            };
        }

        // Knowing the maximum drawable size. Anything greater than that should be considered DLC.
        // So it's usually MAXIMUM_GTAV_DEFAULT_AMOUNT + DLC_COUNTS_PER_ID
        // We can then use the total count per dlc data to find a relative hash based on the array order.
        // Example if the maximum is 48, and our dlc is located on 49.
        // When a clothing component is set for a DLC item, it uses the dlc hash and the relative id number for
        // the dlc to determine it's position.
        // Example being:
        // Vanilla GTA has a hash of 0
        // The drawable at 1 is always 1.
        // A DLC will have a longer hash like 5321532532
        // The drawable at 1 is always 1; granted you provide the hash.
        // Otherwise if DLC order shifts or changes position it will never be correct if you use the absolute id from the client.
        // That being said it is important that DLC order matches resource order.
        let currentSize = defaultMaxSize;
        const dataSet: Array<CLOTHING_DLC_INFO> = isProp
            ? CLOTHING_CONFIG.DLC_PROPS[id]
            : CLOTHING_CONFIG.DLC_CLOTHING[id];

        if (!dataSet) {
            return null;
        }

        for (const info of dataSet) {
            for (let drawableIndex = 0; drawableIndex < info.count[player.data.appearance.sex]; drawableIndex++) {
                currentSize += 1;

                if (currentSize === drawable) {
                    return {
                        dlcName: DLC_CLOTH_HASH[player.data.appearance.sex] + info.dlcName,
                        drawable: drawableIndex,
                        texture,
                    };
                }
            }
        }

        return null;
    }

    /**
     * Maps incorrectly reported dlc hashes from `.getDlcClothes(id)` to hopefully the correct one.
     *
     * @static
     * @param {number} dlc
     * @memberof ClothingFunctions
     */
    static mapDlcHash(dlc: number): number {
        switch (dlc) {
            case 1224880856:
                dlc = alt.hash('mp_f_sum2');
                break;

            default:
                break;
        }

        return dlc;
    }

    /**
     * Maps incorrectly reported dlc drawable from `.getDlcClothes(id)` to hopefully the correct one.
     *
     * @static
     * @param {number} dlc
     * @param {number} drawable
     * @memberof ClothingFunctions
     */
    static mapDlcDrawable(dlc: number, drawable: number): number {
        switch (dlc) {
            case alt.hash('mp_m_sum2'):
                drawable++;
                break;

            default:
                break;
        }

        return drawable;
    }
    /**
     * Purchases all components sent up from the client-side.
     *
     * @static
     * @param {alt.Player} player
     * @param {Array<ComponentVueInfo>} components
     * @memberof ClothingFunctions
     */
    static async purchaseAll(player: alt.Player, components: Array<ComponentVueInfo>) {
        if (components.length <= 0) {
            return;
        }

        for (const comp of components) {
            const result = await ClothingFunctions.purchase(
                player,
                comp.uid,
                comp.index,
                comp.componentData,
                comp.pageName,
                comp.name,
                true,
            );

            Athena.player.emit.soundFrontend(
                player,
                result ? 'Hack_Success' : 'Hack_Failed',
                'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS',
            );
        }

        Athena.player.emit.sound2D(player, 'item_purchase');
    }

    /**
     * How clothing purchases are handled.
     * @static
     * @param {alt.Player} player
     * @param {number} equipmentSlot
     * @param {ClothingComponent} component
     * @param {string} name
     * @param {string} desc
     * @return {*}
     * @memberof ClothingFunctions
     */
    static async purchase(
        player: alt.Player,
        shopUID: string,
        equipmentSlot: number,
        component: ClothingComponent,
        name: string,
        desc: string,
        noSound = false,
    ): Promise<boolean> {
        const index = clothingStoreList.findIndex((x) => x.uid === shopUID);
        if (index <= -1) {
            Athena.player.emit.sound2D(player, 'item_error');
            return false;
        }

        const shop = clothingStoreList[index];
        const id: number = component.internalID;

        let totalCost: number = 0;
        for (let i = 0; i < component.drawables.length; i++) {
            const drawable: number = component.drawables[i];

            // Price based on component id in individual shop.
            if (shop.clothingPrices[id]) {
                const componentInfo = shop.clothingPrices[id].find((item) => {
                    if (item.id === drawable) {
                        return true;
                    }

                    return false;
                });

                if (componentInfo && componentInfo.price) {
                    totalCost += componentInfo.price;
                    continue;
                }
            }

            // Get individual page cost for all items if component has no price.
            if (shop.pagePrices[id]) {
                totalCost += shop.pagePrices[id];
            }
        }

        if (totalCost >= 1) {
            if (player.data.cash + player.data.bank < totalCost) {
                Athena.player.emit.sound2D(player, 'item_error');
                return false;
            }
        }

        // Remove unncessary information
        delete component.internalID;

        const newItem = Athena.utility.deepCloneObject<Item<ClothingComponent>>(wearableRef);
        newItem.name = name;
        newItem.description = desc;
        newItem.data = { ...component };
        newItem.data.sex = player.data.appearance.sex;
        newItem.data.dlcHashes = [];
        newItem.slot = equipmentSlot;
        newItem.icon = icons[equipmentSlot];
        newItem.quantity = 1;
        newItem.equipment = equipmentSlot;

        Athena.player.sync.singleEquipment(player, newItem.data as ClothingComponent);

        await alt.Utils.wait(500);

        for (let i = 0; i < component.drawables.length; i++) {
            const dlcInfo = ClothingFunctions.getDlcHash(
                player,
                component.ids[i],
                component.drawables[i],
                component.textures[i],
                component.isProp,
            );

            newItem.data.dlcHashes.push(dlcInfo.dlcName);
            newItem.data.drawables[i] = dlcInfo.drawable;
            newItem.data.textures[i] = dlcInfo.texture;
        }

        let didGetAdded = false;

        if (Athena.player.inventory.isEquipmentSlotFree(player, equipmentSlot)) {
            didGetAdded = Athena.player.inventory.equipmentAdd(player, newItem, equipmentSlot);
        } else {
            const openSlot = Athena.player.inventory.getFreeInventorySlot(player);
            if (!openSlot) {
                Athena.player.emit.sound2D(player, 'item_error');
                return false;
            }

            Athena.player.emit.message(player, LocaleController.get(LOCALE_KEYS.CLOTHING_ITEM_IN_INVENTORY));
            didGetAdded = Athena.player.inventory.inventoryAdd(player, newItem, openSlot.slot);
        }

        if (!didGetAdded) {
            Athena.player.emit.sound2D(player, 'item_error');
            return false;
        }

        if (totalCost >= 1) {
            if (!Athena.player.currency.subAllCurrencies(player, totalCost)) {
                Athena.player.emit.sound2D(player, 'item_error');
                return false;
            }
        }

        await Athena.state.setBulk(
            player,
            { inventory: player.data.inventory, equipment: player.data.equipment },
            true,
        );
        Athena.player.sync.inventory(player);
        Athena.player.sync.equipment(player, player.data.equipment as Item[], player.data.appearance.sex === 1);

        if (!noSound) {
            Athena.player.emit.sound2D(player, 'item_purchase');
        }

        return true;
    }

    /**
     * When a player enters a stream polygon, play a sound.
     * @param {uniontype} player - The player that entered the polygon.
     * @param {IStreamPolygon} _polygon - The polygon that the player is entering.
     */
    static enter(_polygon: PolygonShape, player: alt.Player) {
        if (!(player instanceof alt.Player)) {
            return;
        }

        Athena.player.emit.sound2D(player, 'shop_enter', 0.5);
    }

    /**
     * When a player leaves a polygon, the function is called.
     * @param {T} _player - The player that is leaving the polygon.
     * @param {IStreamPolygon} _polygon - The polygon that the player is leaving.
     */
    static leave(_polygon: PolygonShape, _player: alt.Player) {
        // Not Important. Just a placeholder _Name for placeholder variable.
    }
}

alt.onClient(CLOTHING_INTERACTIONS.EXIT, ClothingFunctions.exit);
alt.onClient(CLOTHING_INTERACTIONS.PURCHASE, ClothingFunctions.purchase);
alt.onClient(CLOTHING_INTERACTIONS.PURCHASE_ALL, ClothingFunctions.purchaseAll);
