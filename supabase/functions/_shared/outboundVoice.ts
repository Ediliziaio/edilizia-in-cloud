export function outboundVoiceRequest(provider: string, agentId: string, phoneId: string, toNumber: string, variables?: Record<string, string>) {
  const routes: Record<string, string> = { telnyx: "sip-trunk", sip_trunk: "sip-trunk", twilio: "twilio", exotel: "exotel" };
  const route = routes[provider];
  if (!route) throw new Error("Provider telefonico non supportato: verifica il collegamento del numero");
  return {
    url: `https://api.elevenlabs.io/v1/convai/${route}/outbound-call`,
    payload: {
      agent_id: agentId, agent_phone_number_id: phoneId, to_number: toNumber,
      ...(variables && Object.keys(variables).length ? { conversation_initiation_client_data: { dynamic_variables: variables } } : {}),
    },
  };
}
