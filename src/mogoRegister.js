const { ethers } = require("ethers");
const { DefenderRelaySigner, DefenderRelayProvider } = require("defender-relay-client/lib/ethers");
const { KeyValueStoreClient } = require("defender-kvstore-client");

const MAX_MINT = 5;

const addresses = {
  optimism: {
    mintBotAddress: "0x0000000000000000000000000000000000000000",
    userManagerAddress: "0x8E195D65b9932185Fcc76dB5144534e0f3597628",
    registerHelperAddress: "0x2683666a3004c553b3a40ed13c32678ed11d9b49",
  },
};

exports.handler = async function (payload) {
  const provider = new DefenderRelayProvider(payload);
  const signer = new DefenderRelaySigner(payload, provider, { speed: "average" });
  const results = [];

  const content = payload.request.body;
  // console.log({ content });
  const sentinel = content.sentinel;
  const events = content.matchReasons;

  // // for testing
  // const sentinel = { network: "optimism" };
  // const events = [
  //   {
  //     type: "event",
  //     signature: "TransferSingle(address,address,address,uint256,uint256)",
  //     address: "0x3a5e637de3a8a295e7568640abbcbd41e5c7b73c",
  //     args: [
  //       "0xCbD1c32A1b3961cC43868B8bae431Ab0dA65beEb",
  //       // "0x0000000000000000000000000000000000000000",
  //       "0xCbD1c32A1b3961cC43868B8bae431Ab0dA65beEb",
  //       "0x258Bad0751299cE659E443dB1D166FD881cBA281",
  //       "1",
  //       "1",
  //     ],
  //     params: {
  //       operator: "0xCbD1c32A1b3961cC43868B8bae431Ab0dA65beEb",
  //       from: "0xCbD1c32A1b3961cC43868B8bae431Ab0dA65beEb", // "0x0000000000000000000000000000000000000000",
  //       to: "0xFC32E7c7c55391ebb4F91187c91418bF96860cA9", //"0x258Bad0751299cE659E443dB1D166FD881cBA281",
  //       id: "1",
  //       value: "1",
  //     },
  //   },
  // ];

  // console.log({ sentinel });
  console.log({ events });

  const network = sentinel.network;

  if (network != "optimism") {
    return { results };
  }

  const store = new KeyValueStoreClient(payload);

  const userManager = new ethers.Contract(addresses[network].userManagerAddress, userManagerABI, provider);

  await Promise.all(
    events.map(async (evt) => {
      const { operator, from, to, id, value } = evt.params;
      console.log({ operator, from, to, id, value });

      if (from == ethers.constants.AddressZero) {
        // for the mint tx
        console.log("processing mint event");
        const minter = to;

        const isMinterMember = await userManager.checkIsMember(minter);
        console.log({ isMinterMember });
        if (!isMinterMember) {
          // if minter is not member, register minter
          const res = await registerMember(signer, minter, addresses[network].mintBotAddress);
          results.push(res);
        } else {
          console.log(minter + " is member already");
        }

        let mintCounter = await store.get(minter);
        if (!mintCounter) {
          mintCounter = value > MAX_MINT ? MAX_MINT : value;
          await store.put(minter, parseInt(mintCounter).toString());
        } else {
          const newCounter = parseInt(mintCounter) + value;
          mintCounter = newCounter > MAX_MINT ? MAX_MINT : newCounter;
          await store.put(minter, mintCounter.toString());
        }
        console.log({ minter, mintCounter });
      } else {
        // for other transfer tx
        console.log("processing transfer event");

        let mintCounter = await store.get(from);
        console.log({ from, mintCounter });
        if (mintCounter && parseInt(mintCounter) > 0) {
          const isRecMember = await userManager.checkIsMember(to);
          console.log({ isRecMember });
          if (!isRecMember) {
            // if recipient is not member, register recipient
            const res = await registerMember(signer, to, from);
            results.push(res);

            // update the minCounter
            mintCounter = parseInt(mintCounter) - 1;
            await store.put(from, mintCounter.toString());
          } else {
            console.log("recipient: " + to + "is member already");
          }
          console.log({ from, mintCounter });
        } else {
          console.log("sender: " + from + " is not valid minter");
        }
      }
    })
  );

  return { results };
};

const registerMember = async function (signer, newMember, referrer) {
  const network = await signer.provider.getNetwork();
  const registerHelper = new ethers.Contract(addresses[network.name].registerHelperAddress, registerHelperABI, signer);
  const regFee = parseInt(await registerHelper.regFee());
  const rebate = parseInt(await registerHelper.rebate());

  // console.log({ value: regFee + rebate });

  const tx = await registerHelper.register(newMember, referrer, { value: regFee + rebate });
  return tx.hash;
};

const userManagerABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "checkIsMember",
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
];

const registerHelperABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "newUser",
        type: "address",
      },
      {
        internalType: "address payable",
        name: "referrer",
        type: "address",
      },
    ],
    name: "register",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "regFee",
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
  {
    inputs: [],
    name: "rebate",
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
