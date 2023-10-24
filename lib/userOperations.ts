import type {
  UserOperationRequest,
  UserOperationStruct,
} from "@alchemy/aa-core";
import {
  toHex,
  type Client,
  encodeAbiParameters,
  keccak256,
  isHex,
} from "viem";
import {
  BASE_GOERLI_ENTRYPOINT_ADDRESS,
  PRE_VERIFICATION_GAS_BUFFER,
  VERIFICATION_GAS_LIMIT_BUFFER,
} from "./constants";
import { baseGoerli } from "viem/chains";
import type { AlchemyProvider } from "@alchemy/aa-alchemy";

/** Wraps an arbitrary object type to enforce that all values are hex-formatted strings */
type AsHex<T> = {
  [K in keyof T]: `0x${string}`;
};

/**
 * Helper function to convert an arbitrary value from a UserOperation (e.g. `nonce`) to a
 * hex-formatted string (`0x${string}`).
 */
const formatAsHex = (
  value: undefined | string | Uint8Array | bigint | number
): `0x${string}` | undefined => {
  if (value === undefined) {
    return value;
  } else if (typeof value === "string") {
    if (!isHex(value))
      throw new Error("Cannot convert a non-hex string to a hex string");
    return value as `0x${string}`;
  } else {
    // Handles Uint8Array, bigint, and number
    return toHex(value);
  }
};

/**
 * Helper function to convert the fields of an unsigned user operation to all hexadecimal
 * strings.
 * @param userOp {UserOperationStruct}
 * @returns {AsHex<UserOperationStruct>} userOp with all fields transformed to hexstrings
 */
export const formatUserOpAsHex = (userOp: UserOperationStruct) => {
  const {
    sender,
    nonce,
    initCode,
    callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymasterAndData,
    signature,
  } = userOp;

  const formattedUserOp: AsHex<UserOperationStruct> = {
    sender: formatAsHex(sender)!,
    nonce: formatAsHex(nonce)!,
    initCode: formatAsHex(initCode)!,
    callData: formatAsHex(callData)!,
    callGasLimit: formatAsHex(callGasLimit),
    verificationGasLimit: formatAsHex(verificationGasLimit),
    preVerificationGas: formatAsHex(preVerificationGas),
    maxFeePerGas: formatAsHex(maxFeePerGas),
    maxPriorityFeePerGas: formatAsHex(maxPriorityFeePerGas),
    paymasterAndData: formatAsHex(paymasterAndData)!,
    signature: formatAsHex(signature)!,
  };

  return formattedUserOp;
};
/**
 * Accepts an unsigned user operation and buffers its `preVerificationGas` and `verificationGasLimit`
 * with the recommended gas bumps to cover verification of the Base Goerli paymaster.
 *
 * @param userOp {UserOperationStruct}
 * @returns {AsHex<UserOperationStruct>}
 */
export const bufferUserOpWithVerificationGas = (
  userOp: AsHex<UserOperationStruct>
) => {
  const bufferedUserOp: AsHex<UserOperationStruct> = {
    ...userOp,
    preVerificationGas: userOp.preVerificationGas
      ? toHex(BigInt(userOp.preVerificationGas) + PRE_VERIFICATION_GAS_BUFFER)
      : undefined,
    verificationGasLimit: userOp.verificationGasLimit
      ? toHex(
          BigInt(userOp.verificationGasLimit) + VERIFICATION_GAS_LIMIT_BUFFER
        )
      : undefined,
  };

  return bufferedUserOp;
};

/**
 * Accepts an unsigned user operation and queries the Base Goerli paymaster to determine
 * if the operation will be sponsored. If the paymaster will sponsor the user operation,
 * this method will populate the operation's `paymasterAndData` field with the paymaster response.
 *
 * If the paymaster will not sponsor the user operation, this method will throw an error.
 *
 * @param userOp {UserOperationStruct} unsigned user operation to be sponsored
 * @param rpcClient {Client} Public RPC client connected to the Base Goerli Paymaster
 * @returns {UserOperationStruct} unsigned user operation with `paymasterAndData` popuilated
 */
export const addPaymasterAndDataToUserOp = async (
  userOp: AsHex<UserOperationStruct>,
  rpcClient: Client
): Promise<AsHex<UserOperationStruct>> => {
  const paymasterResponse = await rpcClient.request({
    // @ts-ignore
    method: "eth_paymasterAndDataForUserOperation",
    params: [
      // @ts-ignore
      userOp,
      BASE_GOERLI_ENTRYPOINT_ADDRESS,
      // @ts-ignore
      toHex(baseGoerli.id),
    ],
  });

  const userOpWithPaymasterAndData: AsHex<UserOperationStruct> = {
    ...userOp,
    paymasterAndData: paymasterResponse as `0x${string}`,
  };

  return userOpWithPaymasterAndData;
};

/**
 * Accepts an unsigned user operation and packs it. Used as part of the procedure required to
 * compute the user operation's hash and sign it.
 *
 * Adapted to viem from https://github.com/stackup-wallet/userop.js/blob/main/src/context.ts
 *
 * @param userOp {UserOperationStruct} unsigned user operation
 * @returns {`0x${string}`} hexadecimal string representing packed user operation
 */
const packUserOp = (userOp: AsHex<UserOperationStruct>) => {
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
      userOp.sender,
      BigInt(userOp.nonce),
      keccak256(userOp.initCode),
      keccak256(userOp.callData),
      BigInt(userOp.callGasLimit!),
      BigInt(userOp.verificationGasLimit!),
      BigInt(userOp.preVerificationGas!),
      BigInt(userOp.maxFeePerGas!),
      BigInt(userOp.maxPriorityFeePerGas!),
      keccak256(userOp.paymasterAndData),
    ]
  );

  return packedUserOp;
};

/**
 * Accepts an unsigned user operation and computes its hash, by first packing it, and then re-encoding
 * and hashing the packed user operation with the entry point address and chain ID.
 *
 * Adapted to viem from https://github.com/stackup-wallet/userop.js/blob/main/src/context.ts
 *
 * @param userOp {UserOperationStruct} unsigned user operation
 * @returns {`0x${string}`} hexadecimal string representing the user operation's hash
 */
const computeUserOpHash = (userOp: AsHex<UserOperationStruct>) => {
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

/**
 * Accepts an unsigned user operation and computes its hash, and then signature, given the
 * AlchemyProvider for the user's smart wallet. The input user operation should have all of
 * its necessary fields populated/modified (e.g. `paymasterAndData`, `preVerificationGas`, etc.).
 *
 * Adapted to viem from https://github.com/stackup-wallet/userop.js/blob/main/src/context.ts
 *
 * @param userOp {UserOperationStruct} unsigned user operation
 * @returns {UserOperationStruct} user operation with the `signature` field populated
 */
export const signUserOp = async (
  userOp: AsHex<UserOperationStruct>,
  provider: AlchemyProvider
) => {
  // Compute hash and signature
  const userOpHash = computeUserOpHash(userOp);
  const signature = await provider.signMessage(userOpHash);

  // All of the required parameters should have been populated by this point.
  // @ts-ignore
  const signedUserOp: UserOperationRequest = {
    ...userOp,
    signature: signature,
  };

  return signedUserOp;
};
