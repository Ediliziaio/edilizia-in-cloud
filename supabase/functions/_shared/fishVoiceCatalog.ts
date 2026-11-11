/** Public presets approved by the platform. Private voices stay scoped to their assigned company. */
export const FISH_PUBLIC_VOICES = [
 {id:"0e36e185d0654d5bac3d24331562a0cc",name:"Giulia · italiano",languages:["it"],description:"Voce italiana del collaudo iniziale."},
 {id:"081b06713d084d4da1724846b52832ac",name:"Voce Riflessiva · italiano",languages:["it"],description:"Calda, chiara e pacata. Voce pubblica con licenza Fish, verificata il 10 novembre 2026."},
];
export const isFishPublicVoice=(id:string)=>FISH_PUBLIC_VOICES.some(voice=>voice.id===id);
