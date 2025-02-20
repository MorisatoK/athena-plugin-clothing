import * as alt from 'alt-server';
import { PluginSystem } from '@AthenaServer/systems/plugins';
import { ClothingFunctions } from './src/view';

const PLUGIN_NAME = 'Athena Clothing';

PluginSystem.registerPlugin(PLUGIN_NAME, () => {
    ClothingFunctions.init();
    alt.log(`~lg~${PLUGIN_NAME} was Loaded`);
});
