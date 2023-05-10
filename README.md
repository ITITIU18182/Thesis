# A Credential Management System on Blockchain with Verkle Tree
This is a research paper on the application of Blockchain technology and Verkle Tree to build a credential management system. Verkle tree has the same structure as Merkle Tree, so this implementation part will mainly talk about how Verkle Tree uses KZG Commitment to commit as well as verify Proof.

During development, I applied the Typescript library which implements the KZG10 polynominal commitment scheme by weijiekoh. It can produce and verify proofs of one point per proof, or multiple points per proof.

## Describe Error
Due to some conflicts with Node.js as well as TypeScript version will report an error after installation but can still install and use the main function of the program.
Just ignore the error and run "npm run test" and "npm run build" to run the main funtion.

```
npm ERR! command C:\Program Files\nodejs\node.exe C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js install --force --cache=C:\Users\Admin\AppData\Local\npm-cache --prefer-offline=false --prefer-online=false --offline=false --no-progress --no-save --no-audit --include=dev --include=peer --include=optional --no-package-lock-only 
--no-dry-run
npm ERR! npm WARN using --force Recommended protections disabled.
npm ERR! npm WARN old lockfile
npm ERR! npm WARN old lockfile The package-lock.json file was created with an old version of npm,
npm ERR! npm WARN old lockfile so supplemental metadata must be fetched from the registry.
npm ERR! npm WARN old lockfile
npm ERR! npm WARN old lockfile This is a one-time fix-up, please be patient...
npm ERR! npm WARN old lockfile
...
```

```
node_modules/@types/babel__traverse/index.d.ts:68:50 - error TS1005: ']' expected.

68 export type ArrayKeys<T> = keyof { [P in keyof T as T[P] extends any[] ? P : never]: P };

node_modules/@types/babel__traverse/index.d.ts:68:53 - error TS1005: ';' expected.

68 export type ArrayKeys<T> = keyof { [P in keyof T as T[P] extends any[] ? P : never]: P };

node_modules/@types/babel__traverse/index.d.ts:68:58 - error TS1005: ';' expected.

68 export type ArrayKeys<T> = keyof { [P in keyof T as T[P] extends any[] ? P : never]: P };
```

## Functions

### `genCoefficients`: generate a polynominal from arbitrary values
**`genCoefficients = (values: bigint[]): Coefficient[]`**

Given a list of arbitrary values, use polynominal interpolation to generate the
coefficients of a polynominal to commit. Each value must be lower than the
BabyJub field size:

`21888242871839275222246405745257275088548364400416034343698204186575808495617`

```
const genCoefficients = (
    values: bigint[],
    p: bigint = FIELD_SIZE,
): Coefficient[] => {
    // Check the inputs
    for (let value of values) {
        assert(typeof(value) === 'bigint')
        assert(value < FIELD_SIZE)
    }

    // Perform the interpolation
    const field = galois.createPrimeField(p)
    const x: bigint[] = []
    for (let i = 0; i < values.length; i ++) {
        x.push(BigInt(i))
    }
    const xVals = field.newVectorFrom(x)
    const yVals = field.newVectorFrom(values)
    const coefficients = field.interpolate(xVals, yVals).toValues()
 
    // Check the outputs
    for (let coefficient of coefficients) {
        assert(coefficient < FIELD_SIZE)
    }
    return coefficients
}
```

### `commit`: generate a polynominal commitment

**`commit = (coefficients: bigint[]): Commitment`**

Generate a commitment to the polynominal with the specified coefficients.

```
const commit = (
    coefficients: bigint[],
): Commitment => {
    const srs = srsG1(coefficients.length)
    return polyCommit(coefficients, G1, srs)
}

const polyCommit = (
    coefficients: bigint[],
    G: G1Point | G2Point,
    srs: G1Point[] | G2Point[],
): G1Point | G2Point => {
    let result = G.zero
    for (let i = 0; i < coefficients.length; i ++) {
        let coeff = BigInt(coefficients[i])
        assert(coeff >= BigInt(0))

        result = G.affine(G.add(result, G.mulScalar(srs[i], coeff)))

        //if (coeff < 0) {
            //coeff = BigInt(-1) * coeff
            //result = G.affine(G.add(result, G.neg(G.mulScalar(srs[i], coeff))))
        //} else {
            //result = G.affine(G.add(result, G.mulScalar(srs[i], coeff)))
        //}
    }

    return result
}
```

### `genProof`: generate a proof of evaluation at one point

**`genProof = (coefficients: Coefficient[], index: number | bigint): Proof`**

Generate a proof (also known as a witness) that the polynominal will evaluate
to `p(index)` given `index` as the x-value.

```
const genProof = (
    coefficients: Coefficient[],
    index: number | bigint,
    p: bigint = FIELD_SIZE,
): Proof => {
    const quotient = genQuotientPolynomial(coefficients, BigInt(index), p)
    return commit(quotient)
}
```

### `verify`: verify a proof of evaluation at one point

**`verify = (commitment: Commitment, proof: Proof, index: number | bigint, value: bigint): boolean`**

Given a proof, verify that the polynominal with the specified commitment
evaluates to the y-value `value` at the x-value `index`.

```
const verify = (
    commitment: Commitment,
    proof: Proof,
    index: number | bigint,
    value: bigint,
    p: bigint = FIELD_SIZE,
): boolean => {
    // To verify the proof, use the following equation:
    // (p - a) == proof * (x - z)
    // (p - a) / (x - z) == proof

    // Check that 
    // e(commitment - aCommit, G2.g) == e(proof, xCommit - zCommit)
    //
    // xCommit = commit([0, 1]) = SRS_G2_1
    // zCommit = commit([_index]) = SRS_G2_1 * _index
    // e((index * proof) + (commitment - aCommit), G2.g) == e(proof, xCommit)
    //
    index = BigInt(index)
    const field = galois.createPrimeField(p)
    const srs = srsG2(2)
    
    const aCommit = commit([BigInt(value)])
    const xCommit = srs[1] // polyCommit(x.toValues(), G2, srs)

    const lhs = ffjavascript.bn128.pairing(
        G1.affine(
            G1.add(
                G1.mulScalar(proof, index), // index * proof
                G1.sub(commitment, aCommit), // commitment - aCommit
            ),
        ),
        G2.g,
    )

    const rhs = ffjavascript.bn128.pairing(
        G1.affine(proof),
        srs[1], // xCommit
    )

    return ffjavascript.bn128.F12.eq(lhs, rhs)
}

```

### `genMultiProof`: generate a proof of evaluation at multiple points

**`genMultiProof = (coefficients: Coefficient[], indices: number[] | bigint[]): MultiProof`**

Generate a proof (also known as a witness) that the polynominal will evaluate
to `p(indices[i])` per `i`.

```
const genMultiProof = (
    coefficients: Coefficient[],
    indices: number[] | bigint[],
    p: bigint = FIELD_SIZE,
): MultiProof => {
    assert(coefficients.length > indices.length)

    const field = galois.createPrimeField(p)
    const poly = field.newVectorFrom(coefficients)

    const iPoly = genInterpolatingPoly(field, poly, indices)
    const zPoly = genZeroPoly(field, indices)
    const qPoly = field.divPolys(
        field.subPolys(poly, iPoly),
        zPoly,
    )

    const qPolyCoeffs = qPoly.toValues()
    const multiProof = polyCommit(qPolyCoeffs, G2, srsG2(qPolyCoeffs.length))

    return multiProof
}
```

### `verifyMulti`: verify a proof of evaulation at multiple points

**`verifyMulti = (commitment: Commitment, proof: MultiProof, indices: number[] | bigint[], values: bigint[])`**

Given a proof, verify that the polynominal with the specified commitment
evaluates to the each y-value in `values` at the corresponding x-value in
`indices`.

```
const verifyMulti = (
    commitment: Commitment,
    proof: MultiProof,
    indices: number[] | bigint[],
    values: bigint[],
    p: bigint = FIELD_SIZE,
) => {
    const field = galois.createPrimeField(p)
    const xVals: bigint[] = []

    for (let i = 0; i < indices.length; i ++) {
        const index = BigInt(indices[i])
        xVals.push(index)
    }
    const iPoly = field.interpolate(
        field.newVectorFrom(xVals),
        field.newVectorFrom(values),
    )
    const zPoly = genZeroPoly(field, indices)

    // e(proof, commit(zPoly)) = e(commitment - commit(iPoly), g)

    const zCommit = commit(zPoly.toValues())
    const iCommit = commit(iPoly.toValues())

    const lhs = ffjavascript.bn128.pairing(
        G1.affine(zCommit),
        G2.affine(proof),
    )

    const rhs = ffjavascript.bn128.pairing(
        G1.affine(G1.sub(commitment, iCommit)),
        G2.g,
    )

    return ffjavascript.bn128.F12.eq(lhs, rhs)
}
```

## Try it out

Clone this repository from
https://github.com/weijiekoh/libkzg

Install dependencies, and build the source:

```bash
git clone git@github.com:weijiekoh/libkzg.git &&
cd libkzg &&
npm i &&
npm run build
```

Run the tests:

```bash
npm run test
```

The output should look like:

```
 PASS  ts/__tests__/libkzg.test.ts (12.513 s)
  libkzg
    commit, prove, and verify the polynomial [5, 0, 2 1]
      ✓ compute the coefficients to commit using genCoefficients() (4 ms)
      ✓ generate a KZG commitment (1 ms)
      ✓ generate the coefficients of a quotient polynomial
      ✓ generate a KZG proof (1 ms)
      ✓ verify a KZG proof (1553 ms)
      ✓ not verify an invalid KZG proof (2154 ms)
    commit, prove, and verify a random polynomial
      ✓ generate a valid proof (1400 ms)
    pairing checks
      ✓ perform a pairing check than e(xg, yg) = e(yg, xg) (696 ms)
      ✓ perform a pairing check than e(xyg, g) = e(xg, yg) (709 ms)
      ✓ perform pairing checks using ffjavascript (2154 ms)
      ✓ perform pairing checks using rustbn.js (1083 ms)
    multiproofs
      ✓ should generate and verify a multiproof (713 ms)
      ✓ not verify an invalid multiproof (728 ms)
```

## Fail at Commit or Verify process

```
  FAIL  ts/__tests__/libkzg.test.ts (30.447 s)
  libkzg
    commit, prove, and verify the polynomial [5, 0, 2, 1]
      √ compute the coefficients to commit using genCoefficients() (11 ms)
      √ generate a KZG commitment (18 ms)
      √ generate the coefficients of a quotient polynomial (5 ms)
      √ generate a KZG proof (5 ms)
      × verify a KZG proof (1981 ms)
      √ not verify an invalid KZG proof (4441 ms)
    commit, prove, and verify a random polynomial
      √ generate a valid proof (2702 ms)
    pairing checks
      √ perform a pairing check than e(xg, yg) = e(yg, xg) (1371 ms)
      √ perform a pairing check than e(xyg, g) = e(xg, yg) (1279 ms)
      √ perform pairing checks using ffjavascript (4371 ms)
      √ perform pairing checks using rustbn.js (1831 ms)
    multiproofs
      √ should generate and verify a multiproof (1373 ms)
      √ not verify an invalid multiproof (1487 ms)
```


## Trusted setup

Details on the theory of Trusted Setup will be given in the thesis report.

The trusted setup for this library is the [Perpetual Powers of Tau Ceremony
(PPOT)](https://github.com/weijiekoh/perpetualpowersoftau<Paste>). It can commit up to 65536 values since it is packed with the first 65536 G1 and the first two G2 powers of tau from the 46th contribution to the ceremony.

The Blake2b hash of this challenge file is:

```
939038cd 2dc5a1c0 20f368d2 bfad8686 
950fdf7e c2d2e192 a7d59509 3068816b
becd914b a293dd8a cb6d18c7 b5116b66 
ea54d915 d47a89cc fbe2d5a3 444dfbed
```

The challenge file can be retrieved at:

https://ppot.blob.core.windows.net/public/challenge_0046

The ceremony transcript can be retrieved at:

https://github.com/weijiekoh/perpetualpowersoftau

## Credits
Special thanks to [Koh Wei Jie](https://github.com/weijiekoh/) for the ideas and development in the library.
