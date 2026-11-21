import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { FvVistePdfTetto } from "../../components/fotovoltaico/tetto/FvVistePdfTetto";
import { pianoDaMappaFv } from "../../components/fotovoltaico/tetto/mappaGeometria";
import { leggiDisegnoCommerciale } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";

it("seleziona il 3D consapevolmente e conserva la scelta dopo salvataggio e riapertura",()=>{
  const iniziale=pianoDaMappaFv({versione:1,origine:{lat:45,lng:9},ricerca:{indirizzo:"Collaudo",posizione:{lat:45,lng:9}},distanzaOstacoli:.3,falde:[{id:"f1",nome:"Falda",punti:[{x:0,y:0},{x:12,y:0},{x:12,y:8},{x:0,y:8}],inclinazione:30,azimut:180,inclinazioneStimata:true}]},{corto:1.134,lungo:2.165,stimato:false});
  let salvato=iniziale;
  function Harness(){const[p,setP]=useState(iniziale);return <FvVistePdfTetto piano={p} modificabile onChange={next=>{salvato=leggiDisegnoCommerciale(JSON.parse(JSON.stringify(next)))!;setP(salvato);}}/>;}
  const r=render(<Harness/>);
  expect(screen.getByLabelText("Vista 3D")).not.toBeChecked();
  expect(screen.getByLabelText("Satellite con pannelli")).toBeChecked();
  fireEvent.click(screen.getByLabelText("Vista 3D"));
  fireEvent.click(screen.getByLabelText("Disegno 2D"));
  r.unmount();
  render(<FvVistePdfTetto piano={salvato} modificabile={false} onChange={()=>{throw Error("Sola lettura");}}/>);
  expect(screen.getByLabelText("Vista 3D")).toBeChecked();
  expect(screen.getByLabelText("Disegno 2D")).not.toBeChecked();
  expect(screen.getByLabelText("Vista 3D")).toBeDisabled();
});
