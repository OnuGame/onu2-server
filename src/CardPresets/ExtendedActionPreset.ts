import { CardPreset } from "../CardPreset";
import { ACTION_PRESET } from "./ActionPreset";
import { EXTENDED_CLASSIC_PRESET } from "./ExtendedClassicPreset";

export const EXTENDED_ACTION_PRESET: CardPreset = {
    colors: EXTENDED_CLASSIC_PRESET.colors,
    types: ACTION_PRESET.types,
};
