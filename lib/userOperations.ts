import type {
  UserOperationRequest,
  UserOperationStruct,
} from "@alchemy/aa-core";
import { toHex, type Client, encodeAbiParameters, keccak256 } from "viem";
import {
  BASE_GOERLI_ENTRYPOINT_ADDRESS,
  PRE_VERIFICATION_GAS_BUFFER,
  VERIFICATION_GAS_LIMIT_BUFFER,
} from "./constants";
import { baseGoerli } from "viem/chains";
import type { AlchemyProvider } from "@alchemy/aa-alchemy";

export const bufferUserOpWithVerificationGas = (
  userOp: UserOperationStruct
) => {
  const bufferedUserOp: UserOperationStruct = {
    ...userOp,
    nonce: toHex(userOp.nonce),
    maxFeePerGas: userOp.maxFeePerGas ? toHex(userOp.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas
      ? toHex(userOp.maxPriorityFeePerGas)
      : undefined,
    preVerificationGas: toHex(
      BigInt(userOp.preVerificationGas || 0) + PRE_VERIFICATION_GAS_BUFFER
    ),
    verificationGasLimit: toHex(
      BigInt(userOp.verificationGasLimit || 0) + VERIFICATION_GAS_LIMIT_BUFFER
    ),
  };

  return bufferedUserOp;
};

export const addPaymasterAndDataToUserOp = async (
  userOp: UserOperationStruct,
  rpcClient: Client
) => {
  const paymasterResponse = await rpcClient.request({
    // @ts-ignore
    method: "eth_paymasterAndDataForUserOperation",
    params: [
      // @ts-ignore
      userOp,
      BASE_GOERLI_ENTRYPOINT_ADDRESS,
      toHex(baseGoerli.id),
    ],
  });

  const userOpWithPaymasterAndData: UserOperationStruct = {
    ...userOp,
    paymasterAndData: paymasterResponse as `0x${string}`,
  };

  return userOpWithPaymasterAndData;
};

// Adapted to viem from https://github.com/stackup-wallet/userop.js/blob/main/src/context.ts
export const packUserOp = (userOp: UserOperationStruct) => {
  const packedUserOp = encodeAbiParameters(
    [
      { name: "sender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "initCode", type: "bytes32" },
      { name: "callData", type: "bytes32" },
      { name: "callGasLimit", type: "uint256" },
      { name: "verificationGasLimit", type: "uint256" },
      { name: "preVerificationGas", type: "uint256" },
      { name: "maxFeePerGas", type: "uint256" },
      { name: "maxPriorityFeePerGas", type: "uint256" },
      { name: "paymasterAndData", type: "bytes32" },
    ],
    [
      userOp.sender as `0x${string}`,
      BigInt(userOp.nonce),
      keccak256(userOp.initCode as `0x${string}`),
      keccak256(userOp.callData as `0x${string}`),
      BigInt(userOp.callGasLimit!),
      BigInt(userOp.verificationGasLimit!),
      BigInt(userOp.preVerificationGas!),
      BigInt(userOp.maxFeePerGas!),
      BigInt(userOp.maxPriorityFeePerGas!),
      keccak256(userOp.paymasterAndData as `0x${string}`),
    ]
  );

  return packedUserOp;
};

// Adapted to viem from https://github.com/stackup-wallet/userop.js/blob/main/src/context.ts
export const computeUserOpHash = (userOp: UserOperationStruct) => {
  const packedUserOp = packUserOp(userOp);
  const encodedUserOp = encodeAbiParameters(
    [
      { name: "packed", type: "bytes32" },
      { name: "entryPoint", type: "address" },
      { name: "chainId", type: "uint256" },
    ],
    [
      keccak256(packedUserOp),
      BASE_GOERLI_ENTRYPOINT_ADDRESS,
      BigInt(baseGoerli.id),
    ]
  );
  const userOpHash = keccak256(encodedUserOp);
  return userOpHash;
};

export const signUserOp = async (
  userOp: UserOperationStruct,
  provider: AlchemyProvider
) => {
  const userOpHash = computeUserOpHash(userOp);
  const signature = await provider.signMessage(userOpHash);
  // TODO: Move the `0x${string}` casting into a helper
  const signedUserOp: UserOperationRequest = {
    ...userOp,
    sender: userOp.sender as `0x${string}`,
    nonce: userOp.nonce as `0x${string}`,
    initCode: userOp.initCode as `0x${string}`,
    callData: userOp.callData as `0x${string}`,
    callGasLimit: userOp.callGasLimit! as `0x${string}`,
    verificationGasLimit: userOp.verificationGasLimit! as `0x${string}`,
    preVerificationGas: userOp.preVerificationGas! as `0x${string}`,
    maxFeePerGas: userOp.maxFeePerGas! as `0x${string}`,
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas! as `0x${string}`,
    paymasterAndData: userOp.paymasterAndData as `0x${string}`,
    signature: signature,
  };
  return signedUserOp;
};
