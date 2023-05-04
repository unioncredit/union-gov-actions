const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");
const { request, gql } = require("graphql-request");

const GRAPH_URLS = {
  1: "https://api.thegraph.com/subgraphs/name/geraldhost/union",
  5: "https://api.thegraph.com/subgraphs/name/geraldhost/union-goerli",
  10: "https://api.thegraph.com/subgraphs/name/geraldhost/union-optimism",
  42: "https://api.thegraph.com/subgraphs/name/geraldhost/union-kovan",
  420: "https://api.thegraph.com/subgraphs/name/geraldhost/union-v2-goerli",
  42161: "https://api.thegraph.com/subgraphs/name/geraldhost/union-arbitrum",
};

const addresses = {
  10: {
    uTokenAddress: "0xE478b5e7A423d7CDb224692d0a816CA146A744b2",
    userManagerAddress: "0x8E195D65b9932185Fcc76dB5144534e0f3597628",
  },
};

exports.handler = async function (event) {
  // Initialize defender relayer provider and signer
  const provider = new DefenderRelayProvider(event);
  const signer = new DefenderRelaySigner(event, provider, { speed: "fast" });

  const { chainId } = await provider.getNetwork();
  console.log(`chainId: ${chainId}`);

  const uToken = new ethers.Contract(
    addresses[chainId].uTokenAddress,
    uTokenABI,
    signer
  );
  const userManager = new ethers.Contract(
    addresses[chainId].userManagerAddress,
    userManagerABI,
    signer
  );

  const borrowQuery = gql`
    query ($first: Int) {
      borrow: borrowers(first: $first) {
        account
      }
    }
  `;

  const borrowerQuery = await request(GRAPH_URLS[chainId], borrowQuery, {
    first: 1000,
  });
  const borrowers = borrowerQuery.borrow;
  console.log({ borrowers });

  let overdueBorrowers = [],
    stakers = [];
  const promises = Array.from(borrowers).map(async (borrower) => {
    const account = borrower.account;
    const isOverdue = await uToken.checkIsOverdue(account);
    if (isOverdue) {
      overdueBorrowers.push(account);
    }
  });
  await Promise.all(promises);

  console.log({ overdueBorrowers });

  for (let i = 0; i < overdueBorrowers.length; i++) {
    const borrower = overdueBorrowers[i];
    const query = gql`
      query (
        $first: Int
        $vouchCancellationsFilter: VouchCancellation_filter
        $trustLinesFilter: TrustLine_filter
        $trustLinesFilter_Vouch: TrustLine_filter
      ) {
        cancel: vouchCancellations(
          first: $first
          where: $vouchCancellationsFilter
        ) {
          borrower
          staker
        }
        trust: trustLines(first: $first, where: $trustLinesFilter) {
          borrower
          staker
        }
      }
    `;
    const variables = {
      first: 1000,
      trustLinesFilter: {
        borrower,
      },
    };
    const res = await request(GRAPH_URLS[chainId], query, variables);
    for (let i = 0; i < res.trust.length; i++) {
      const staker = res.trust[i].staker.toLowerCase();
      if (stakers.indexOf(staker) == -1) {
        stakers.push(staker);
      }
    }
  }

  console.log({ stakers });

  if (stakers.length > 0) {
    const tx = await userManager.batchUpdateFrozenInfo(stakers);
    console.log(`Called updateOverdueInfo in ${tx.hash}`);
    return { tx: tx.hash, overdueBorrowers, stakers };
  } else {
    return { overdueBorrowers, stakers };
  }
};

const userManagerABI = [
  {
    inputs: [
      {
        internalType: "address[]",
        name: "stakerList",
        type: "address[]",
      },
    ],
    name: "batchUpdateFrozenInfo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const uTokenABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "checkIsOverdue",
    outputs: [
      {
        internalType: "bool",
        name: "isOverdue",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];
