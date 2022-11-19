const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");

const formatUnits = ethers.utils.formatUnits;
const parseUnits = ethers.utils.parseUnits;

const UNION_ADDRESS = "0x5Dfe42eEA70a3e6f93EE54eD9C321aF07A85535C";
const COMPTROLLER_ADDR = "0x216dE4089dCdD7B95BC34BdCe809669C788a9A5d";

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
