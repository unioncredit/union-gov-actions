const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");
const Safe = require("@gnosis.pm/safe-core-sdk").default;
const { EthersAdapter } = require("@gnosis.pm/safe-core-sdk");

const formatUnits = ethers.utils.formatUnits;
const parseUnits = ethers.utils.parseUnits;

const COMPTROLLER_ADDR = "0x85FD0fA5Cc2f0B3A12C146C5B5A37d9e269b3Ba8";
const SAFE_ADDRESS = "0x55C296592acDb317050c84C5eBF4eecCa85a0D8f";

exports.handler = async function (payload) {
  const results = [];

  const content = payload.request.body;
  //   console.log({ content });

  const events = content.matchReasons;
  //   console.log({ events });

  for (const evt of events) {
    // add custom logic for matching here
    const sentinel = content.sentinel;
    // console.log({ sentinel });

    // console.log({ args: evt.args });

    if (sentinel.chainId == 42) {
      const { from, to, value } = evt.params;
      //   console.log({ params: evt.params });

      const provider = new DefenderRelayProvider(payload);
      const signer = new DefenderRelaySigner(payload, provider, {
        speed: "fast",
      });

      const comptroller = new ethers.Contract(
        COMPTROLLER_ADDR,
        COMPTROLLER_ABI,
        signer
      );
      const isPaused = await comptroller.paused();
      if (!isPaused) {
        const ethAdapterSigner = new EthersAdapter({
          ethers,
          signer: signer,
        });

        const safeSdk = await Safe.create({
          ethAdapter: ethAdapterSigner,
          safeAddress: SAFE_ADDRESS,
        });
        const transaction = {
          to: COMPTROLLER_ADDR,
          value: "0",
          data: comptroller.interface.encodeFunctionData("pause()"),
        };
        //   console.log({ transaction });

        const safeTransaction = await safeSdk.createTransaction(transaction);
        //   console.log({ safeTransaction });

        await safeSdk.signTransaction(safeTransaction);

        const txResponse = await safeSdk.executeTransaction(safeTransaction);
        // console.log({ txResponse });
        results.push({
          timestamp: parseInt(new Date().getTime() / 1000),
          claimAmount: formatUnits(value),
          tx: txResponse.hash,
        });
      } else {
        results.push({
          timestamp: parseInt(new Date().getTime() / 1000),
          claimAmount: formatUnits(value),
        });
      }
    }
  }

  return { results };
};

const COMPTROLLER_ABI = [
  {
    inputs: [],
    name: "paused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];
