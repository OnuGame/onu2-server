import { CardPreset } from "../CardPreset";
import { CLASSIC_PRESET } from "./ClassicPreset";

export const EXTENDED_CLASSIC_PRESET: CardPreset = {
    colors: [...CLASSIC_PRESET.colors, "c", "p"],
    types: CLASSIC_PRESET.types,
};
