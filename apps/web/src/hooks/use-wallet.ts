import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, useGame } from "../lib/game/queries";

/** Account plus the connect, disconnect and switch-network actions. */
export function useWallet() {
  const client = useGame();
  const queryClient = useQueryClient();
  const account = useAccount();
  const refresh = () => queryClient.invalidateQueries();
  const connect = useMutation({ mutationFn: () => client.connect(), onSettled: refresh });
  const disconnect = useMutation({ mutationFn: () => client.disconnect(), onSettled: refresh });
  const switchChain = useMutation({ mutationFn: () => client.switchChain(), onSettled: refresh });
  return { account, connect, disconnect, switchChain, mode: client.mode };
}
