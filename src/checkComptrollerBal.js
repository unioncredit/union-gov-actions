const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");
const formatUnits = ethers.utils.formatUnits;
const parseUnits = ethers.utils.parseUnits;

const UNION_ADDRESS = "0x08af898e65493d8212c8981fadf60ff023a91150"; //kovan
const COMPTROLLER_ADDR = "0x85FD0fA5Cc2f0B3A12C146C5B5A37d9e269b3Ba8";

// Use "rollup -c" to package and copy to https://defender.openzeppelin.com/#/autotask to run
exports.handler = async function (payload) {
  //   const { UNION_AUTOTASK_KEY_KOVAN, UNION_AUTOTASK_SECRET_KOVAN } =
  //     payload.secrets;
  //   const credentials = payload.credentials;

  const matches = [];
  const conditionRequest = payload.request.body;
  const events = conditionRequest.events;

  for (const evt of events) {
    // add custom logic for matching here
    const sentinel = evt.sentinel;
    // console.log({ sentinel });
    // console.log({ tx: evt.transaction });
    const [match] = evt.matchReasons;
    // console.log({ match });

    if (sentinel.chainId == 42) {
      const { from, to, value } = match.params;
      const provider = new DefenderRelayProvider(payload);
      const signer = new DefenderRelaySigner(payload, provider, {
        speed: "fast",
      });
      const union = new ethers.Contract(UNION_ADDRESS, ERC20_ABI, signer);
      const compBal = await union.balanceOf(COMPTROLLER_ADDR);

      const percent = parseUnits("1").mul(value).div(compBal.add(value));

      console.log({ percent: formatUnits(percent) });

      if (percent.gte(parseUnits("0.01"))) {
        matches.push({
          hash: evt.hash,
          metadata: {
            timestamp: parseInt(new Date().getTime() / 1000),
            comptrollerBal: formatUnits(compBal),
            claimAmount: formatUnits(value),
            dropPercent: formatUnits(percent),
          },
        });
      }
    }
  }
  return { matches };
};

const ERC20_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];
