from bandersnatch import Scalar, Point, ScalarVector, PointVector
from polynomial import powers, poly_eval, lagrange
from polynomialcommitment import prove, verify
import bandersnatch, polynomialcommitment


class VerkleTree:
    def __init__(self, datablocks: list, exponent: int):
        # the number of children of parent node is 2 ** exponent. exponent is not checked
        datalength = len(datablocks)
        # check datalength
        if datalength == 0:
            raise ValueError('length of datablocks not a power of 2')
        exponent2 = 0   # datalength should be equal to 2 ** exponent2
        while datalength > 1:
            if datalength & 1 != 0:
                raise ValueError('length of datablocks not a power of 2')
            exponent2 += 1
            datalength >>= 1
        if exponent2 % exponent != 0:
            raise ValueError('length of datablocks not a power of 2 ** exponent')

        self.depth = exponent2 // exponent   # tree depth minus the level of datablocks
        self.exponent = exponent
        self.datablocks = datablocks
        self.verkletreecommits = []
        self.verkletreeblipoly = []

    def hashAllCurrNodes(self, nodes: list) -> list:
        return [bandersnatch.hash_to_scalar('verkle', node) for node in nodes]

    def buildVerkleTree(self, printAllCommit=False) -> Point:
        veclen = 2 ** self.exponent   # vector/polynomial length
        currnodes = self.datablocks
        self.G_vec = PointVector([bandersnatch.random_point() for i in range(veclen)])   # (public)
        while len(currnodes) > 1:
            cache1 = []   # for commitments (public)
            cache2 = []   # for blinding factors and polynomial (private)
            nodehashes = self.hashAllCurrNodes(currnodes)
            for i in range(0, len(nodehashes), veclen):
                coords = [(Scalar(j + 1), hash) for j, hash in enumerate(nodehashes[i:i + veclen])]
                poly = lagrange(coords)   # polynomial coefficients
                r = bandersnatch.random_scalar()   # blinding factor
                P = poly ** self.G_vec + r * polynomialcommitment.H   # the actual commitment
                cache1.append(P)
                cache2.append((poly, r))
            self.verkletreecommits.append(cache1)
            self.verkletreeblipoly.append(cache2)
            currnodes = cache1

        if printAllCommit == True:
            print('Level 1 of tree is the datablocks.\n')
            for i in range(self.depth):
                print(f'Level {i + 2} commitments of tree is: {self.verkletreecommits[i]}\n')

        return currnodes[0]   # return verkle tree root commitment

    def requestData(self, index: int) -> tuple:
        num_blocks = len(self.datablocks)
        if not(0 <= index < num_blocks):
            raise ValueError(f'index must be in range({num_blocks})')

        datum = self.datablocks[index]
        currpathdata = datum
        proofs = []
        for i in range(self.depth):
            # initialize prove
            curridx = index & ((1 << self.exponent) - 1)
            x = Scalar(curridx + 1)
            v = bandersnatch.hash_to_scalar('verkle', currpathdata)
            index >>= self.exponent   # move one level up the tree
            curridx = index & ((1 << self.exponent) - 1)
            P = self.verkletreecommits[i][curridx]
            poly, r = self.verkletreeblipoly[i][curridx]
            transcript = prove(self.G_vec, P, x, v, poly, r)
            proofs.append(transcript)
            currpathdata = P
        return datum, proofs


def verifier(index: int, datum: object, proofs: list, root: Point) -> bool:
    # first check: the v of the first proof should be the hash_to_scalar of datum
    # second check: the P of last proof should be the root
    if proofs[0]['state'][2] != bandersnatch.hash_to_scalar('verkle', datum) or proofs[-1]['state'][0] != root:
        return False
    for proof in proofs:
        if not verify(proof):
            return False
    return True


if __name__ == '__main__':
    # len(data) should be a power of 2 ** exponent...
    # source: https://www.random.org/strings/
    data = ['ieSw8BgelIE0uU3F', 'pgefo45q7n0ENl2S', 'fD0gbfK3nPhkZTVY', 'vy6LffVmfkbeUrCJ', 'S0VrYMyUnBXVJ0tH',
            'ZZGDyfmH4gpMRY7c', 'EfuFqRTMav1iVHCW', 'R3aYRV7jx50Fn3bj', 'drPzETyMperjSc2F', 'VlPs7iCGqzXEyR5A',
            '8YUiRM4feJUcQx58', 'uGmJF0SRfHsyM210', 'yUCYIDEu0IKaub7t', 'r9OKyGeCFilq9qV6', 'snrwcwPnRhxRuUYW',
            '0eICX8cX6caxe75']

    verkledata = VerkleTree(data, 2)   # ... where exponent = 2 in this example
    root = verkledata.buildVerkleTree(printAllCommit=True)   # root commitment is a Point
    datum, proofs = verkledata.requestData(11)   # request for data[11]
    print(f'data[11]: {datum}')
    # we'll not print hashes anymore, because proofs 
    # (of polynomial commitment) are more important

    # verify provided proofs
    if verifier(11, datum, proofs, root):
        print('\nProvided proofs are correct!')
    else:
        print('\nProvided proofs are wrong!')