import treeify from 'treeify';
import Base from './Base';

export class MerkleTree extends Base {
    
    // Constructs a Merkle Tree
    // All nodes and leaves are stored as Buffers 
    // Lonely leaf nodes are promoted to the next level up without being hashed again

    constructor(leaves, hashFn = SHA256, options = {}) {
        super();
        this.duplicateOdd = false;
        this.concatenator = Buffer.concat;
        this.hashLeaves = false;
        this.isBitcoinTree = false;
        this.leaves = [];
        this.layers = [];
        this.sortLeaves = false;
        this.sortPairs = false;
        this.sort = false;
        this.fillDefaultHash = null;
        this.complete = false;
        if (options.complete) {
            if (options.isBitcoinTree) {
                throw new Error('option "complete" is incompatible with "isBitcoinTree"');
            }
            if (options.duplicateOdd) {
                throw new Error('option "complete" is incompatible with "duplicateOdd"');
            }
        }
        this.isBitcoinTree = !!options.isBitcoinTree;
        this.hashLeaves = !!options.hashLeaves;
        this.sortLeaves = !!options.sortLeaves;
        this.sortPairs = !!options.sortPairs;
        this.complete = !!options.complete;
        if (options.fillDefaultHash) {
            if (typeof options.fillDefaultHash === 'function') {
                this.fillDefaultHash = options.fillDefaultHash;
            }
            else if (Buffer.isBuffer(options.fillDefaultHash) || typeof options.fillDefaultHash === 'string') {
                this.fillDefaultHash = (idx, hashFn) => options.fillDefaultHash;
            }
            else {
                throw new Error('method "fillDefaultHash" must be a function, Buffer, or string');
            }
        }
        this.sort = !!options.sort;
        if (this.sort) {
            this.sortLeaves = true;
            this.sortPairs = true;
        }
        this.duplicateOdd = !!options.duplicateOdd;
        if (options.concatenator) {
            this.concatenator = options.concatenator;
        }
        this.hashFn = this.bufferifyFn(hashFn);
        this.processLeaves(leaves);
    }

    getOptions() {
        return {
            complete: this.complete,
            isBitcoinTree: this.isBitcoinTree,
            hashLeaves: this.hashLeaves,
            sortLeaves: this.sortLeaves,
            sortPairs: this.sortPairs,
            sort: this.sort,
            fillDefaultHash: this.fillDefaultHash?.toString() ?? null,
            duplicateOdd: this.duplicateOdd
        };
    }

    processLeaves(leaves) {
        if (this.hashLeaves) {
            leaves = leaves.map(this.hashFn);
        }
        this.leaves = leaves.map(this.bufferify);
        if (this.sortLeaves) {
            this.leaves = this.leaves.sort(Buffer.compare);
        }
        if (this.fillDefaultHash) {
            for (let i = 0; i < Math.pow(2, Math.ceil(Math.log2(this.leaves.length))); i++) {
                if (i >= this.leaves.length) {
                    this.leaves.push(this.bufferify(this.fillDefaultHash(i, this.hashFn)));
                }
            }
        }
        this.createHashes(this.leaves);
    }

    createHashes(nodes) {
        this.layers = [nodes];
        while (nodes.length > 1) {
            const layerIndex = this.layers.length;
            this.layers.push([]);
            const layerLimit = this.complete && layerIndex === 1 && !Number.isInteger(Math.log2(nodes.length))
                ? (2 * nodes.length) - (2 ** Math.ceil(Math.log2(nodes.length)))
                : nodes.length;
            for (let i = 0; i < nodes.length; i += 2) {
                if (i >= layerLimit) {
                    this.layers[layerIndex].push(...nodes.slice(layerLimit));
                    break;
                }
                else if (i + 1 === nodes.length) {
                    if (nodes.length % 2 === 1) {
                        const data = nodes[nodes.length - 1];
                        let hash = data;
                        // is bitcoin tree
                        if (this.isBitcoinTree) {
                            // Bitcoin method of duplicating the odd ending nodes
                            hash = this.hashFn(this.concatenator([reverse(data), reverse(data)]));
                            hash = reverse(this.hashFn(hash));
                            this.layers[layerIndex].push(hash);
                            continue;
                        }
                        else {
                            if (this.duplicateOdd) {
                                // continue with creating layer
                            }
                            else {
                                // push copy of hash and continue iteration
                                this.layers[layerIndex].push(nodes[i]);
                                continue;
                            }
                        }
                    }
                }
                const left = nodes[i];
                const right = i + 1 === nodes.length ? left : nodes[i + 1];
                let combined = null;
                if (this.isBitcoinTree) {
                    combined = [reverse(left), reverse(right)];
                }
                else {
                    combined = [left, right];
                }
                if (this.sortPairs) {
                    combined.sort(Buffer.compare);
                }
                let hash = this.hashFn(this.concatenator(combined));
                // double hash if bitcoin tree
                if (this.isBitcoinTree) {
                    hash = reverse(this.hashFn(hash));
                }
                this.layers[layerIndex].push(hash);
            }
            nodes = this.layers[layerIndex];
        }
    }
    
    // Adds a leaf to the tree and re-calculates layers
    addLeaf(leaf, shouldHash = false) {
        if (shouldHash) {
            leaf = this.hashFn(leaf);
        }
        this.processLeaves(this.leaves.concat(leaf));
    }
    
    // Adds multiple leaves to the tree and re-calculates layers
    addLeaves(leaves, shouldHash = false) {
        if (shouldHash) {
            leaves = leaves.map(this.hashFn);
        }
        this.processLeaves(this.leaves.concat(leaves));
    }
    
    // Returns array of leaves of Merkle Tree
    getLeaves(values) {
        if (Array.isArray(values)) {
            if (this.hashLeaves) {
                values = values.map(this.hashFn);
                if (this.sortLeaves) {
                    values = values.sort(Buffer.compare);
                }
            }
            return this.leaves.filter(leaf => this.bufferIndexOf(values, leaf, this.sortLeaves) !== -1);
        }
        return this.leaves;
    }
    
    // Returns the leaf at the given index
    getLeaf(index) {
        if (index < 0 || index > this.leaves.length - 1) {
            return Buffer.from([]);
        }
        return this.leaves[index];
    }
    

    // Returns the index of the given leaf, or -1 if the leaf is not found
    getLeafIndex(target) {
        target = this.bufferify(target);
        const leaves = this.getLeaves();
        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i];
            if (leaf.equals(target)) {
                return i;
            }
        }
        return -1;
    }
    
    // Returns the total number of leaves
    getLeafCount() {
        return this.leaves.length;
    }
    
    // Returns the multiproof for given tree indices as hex strings
    getHexLeaves() {
        return this.leaves.map(leaf => this.bufferToHex(leaf));
    }
    
    // Returns array of leaves of Merkle Tree as a JSON string
    static marshalLeaves(leaves) {
        return JSON.stringify(leaves.map(leaf => MerkleTree.bufferToHex(leaf)), null, 2);
    }
    
    // Returns array of leaves of Merkle Tree as a Buffers
    static unmarshalLeaves(jsonStr) {
        let parsed = null;
        if (typeof jsonStr === 'string') {
            parsed = JSON.parse(jsonStr);
        }
        else if (jsonStr instanceof Object) {
            parsed = jsonStr;
        }
        else {
            throw new Error('Expected type of string or object');
        }
        if (!parsed) {
            return [];
        }
        if (!Array.isArray(parsed)) {
            throw new Error('Expected JSON string to be array');
        }
        return parsed.map(MerkleTree.bufferify);
    }
    
    // Returns multi-dimensional array of all layers of Merkle Tree, including leaves and root
    getLayers() {
        return this.layers;
    }

    // Returns multi-dimensional array of all layers of Merkle Tree, including leaves and root as hex strings
    getHexLayers() {
        return this.layers.reduce((acc, item) => {
            if (Array.isArray(item)) {
                acc.push(item.map(layer => this.bufferToHex(layer)));
            }
            else {
                acc.push(item);
            }
            return acc;
        }, []);
    }
    
    // Returns single flat array of all layers of Merkle Tree, including leaves and root
    getLayersFlat() {
        const layers = this.layers.reduce((acc, item) => {
            if (Array.isArray(item)) {
                acc.unshift(...item);
            }
            else {
                acc.unshift(item);
            }
            return acc;
        }, []);
        layers.unshift(Buffer.from([0]));
        return layers;
    }
    
    // Returns single flat array of all layers of Merkle Tree, including leaves and root as hex string
    getHexLayersFlat() {
        return this.getLayersFlat().map(layer => this.bufferToHex(layer));
    }
    
    // Returns the total number of layers
    getLayerCount() {
        return this.getLayers().length;
    }
    
    // Returns the Merkle root hash as a Buffer
    getRoot() {
        if (this.layers.length === 0) {
            return Buffer.from([]);
        }
        return this.layers[this.layers.length - 1][0] || Buffer.from([]);
    }
    
    // Returns the Merkle root hash as a hex string
    getHexRoot() {
        return this.bufferToHex(this.getRoot());
    }
    
    // Returns the proof for a target leaf
    getProof(leaf, index) {
        if (typeof leaf === 'undefined') {
            throw new Error('leaf is required');
        }
        leaf = this.bufferify(leaf);
        const proof = [];
        if (!Number.isInteger(index)) {
            index = -1;
            for (let i = 0; i < this.leaves.length; i++) {
                if (Buffer.compare(leaf, this.leaves[i]) === 0) {
                    index = i;
                }
            }
        }
        if (index <= -1) {
            return [];
        }
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            const isRightNode = index % 2;
            const pairIndex = (isRightNode ? index - 1
                : this.isBitcoinTree && index === layer.length - 1 && i < this.layers.length - 1
                    // Proof Generation for Bitcoin Trees
                    ? index
                    // Proof Generation for Non-Bitcoin Trees
                    : index + 1);
            if (pairIndex < layer.length) {
                proof.push({
                    position: isRightNode ? 'left' : 'right',
                    data: layer[pairIndex]
                });
            }
            // set index to parent index
            index = (index / 2) | 0;
        }
        return proof;
    }
    
    // Returns the proof for a target leaf as hex strings
    getHexProof(leaf, index) {
        return this.getProof(leaf, index).map(item => this.bufferToHex(item.data));
    }
    
    // Returns the proofs for all leaves
    getProofs() {
        const proof = [];
        const proofs = [];
        this.getProofsDFS(this.layers.length - 1, 0, proof, proofs);
        return proofs;
    }
    
    // Get all proofs through single traverse
    getProofsDFS(currentLayer, index, proof, proofs) {
        const isRightNode = index % 2;
        if (currentLayer === -1) {
            if (!isRightNode)
                proofs.push([...proof].reverse());
            return;
        }
        if (index >= this.layers[currentLayer].length)
            return;
        const layer = this.layers[currentLayer];
        const pairIndex = isRightNode ? index - 1 : index + 1;
        let pushed = false;
        if (pairIndex < layer.length) {
            pushed = true;
            proof.push({
                position: isRightNode ? 'left' : 'right',
                data: layer[pairIndex]
            });
        }
        const leftchildIndex = index * 2;
        const rightchildIndex = index * 2 + 1;
        this.getProofsDFS(currentLayer - 1, leftchildIndex, proof, proofs);
        this.getProofsDFS(currentLayer - 1, rightchildIndex, proof, proofs);
        if (pushed)
            proof.splice(proof.length - 1, 1);
    }
    
    // Returns the proofs for all leaves as hex strings
    getHexProofs() {
        return this.getProofs().map(item => this.bufferToHex(item.data));
    }
    
    // Returns the proof for a target leaf as hex strings and the position in binary (left == 0)
    getPositionalHexProof(leaf, index) {
        return this.getProof(leaf, index).map(item => {
            return [
                item.position === 'left' ? 0 : 1,
                this.bufferToHex(item.data)
            ];
        });
    }
    
    // Returns proof array as JSON string
    static marshalProof(proof) {
        const json = proof.map(item => {
            if (typeof item === 'string') {
                return item;
            }
            if (Buffer.isBuffer(item)) {
                return MerkleTree.bufferToHex(item);
            }
            return {
                position: item.position,
                data: MerkleTree.bufferToHex(item.data)
            };
        });
        return JSON.stringify(json, null, 2);
    }
    
    // Returns the proof for a target leaf as a list of Buffers
    static unmarshalProof(jsonStr) {
        let parsed = null;
        if (typeof jsonStr === 'string') {
            parsed = JSON.parse(jsonStr);
        }
        else if (jsonStr instanceof Object) {
            parsed = jsonStr;
        }
        else {
            throw new Error('Expected type of string or object');
        }
        if (!parsed) {
            return [];
        }
        if (!Array.isArray(parsed)) {
            throw new Error('Expected JSON string to be array');
        }
        return parsed.map(item => {
            if (typeof item === 'string') {
                return MerkleTree.bufferify(item);
            }
            else if (item instanceof Object) {
                return {
                    position: item.position,
                    data: MerkleTree.bufferify(item.data)
                };
            }
            else {
                throw new Error('Expected item to be of type string or object');
            }
        });
    }

    static marshalTree(tree) {
        const root = tree.getHexRoot();
        const leaves = tree.leaves.map(leaf => MerkleTree.bufferToHex(leaf));
        const layers = tree.getHexLayers();
        const options = tree.getOptions();
        return JSON.stringify({
            options,
            root,
            layers,
            leaves
        }, null, 2);
    }

    static unmarshalTree(jsonStr, hashFn = SHA256, options = {}) {
        let parsed = null;
        if (typeof jsonStr === 'string') {
            parsed = JSON.parse(jsonStr);
        }
        else if (jsonStr instanceof Object) {
            parsed = jsonStr;
        }
        else {
            throw new Error('Expected type of string or object');
        }
        if (!parsed) {
            throw new Error('could not parse json');
        }
        options = Object.assign({}, parsed.options || {}, options);
        return new MerkleTree(parsed.leaves, hashFn, options);
    }
    
    // Returns the proof indices for given tree indices
    getProofIndices(treeIndices, depth) {
        const leafCount = 2 ** depth;
        let maximalIndices = new Set();
        for (const index of treeIndices) {
            let x = leafCount + index;
            while (x > 1) {
                maximalIndices.add(x ^ 1);
                x = (x / 2) | 0;
            }
        }
        const a = treeIndices.map(index => leafCount + index);
        const b = Array.from(maximalIndices).sort((a, b) => a - b).reverse();
        maximalIndices = a.concat(b);
        const redundantIndices = new Set();
        const proof = [];
        for (let index of maximalIndices) {
            if (!redundantIndices.has(index)) {
                proof.push(index);
                while (index > 1) {
                    redundantIndices.add(index);
                    if (!redundantIndices.has(index ^ 1))
                        break;
                    index = (index / 2) | 0;
                }
            }
        }
        return proof.filter(index => {
            return !treeIndices.includes(index - leafCount);
        });
    }

    getProofIndicesForUnevenTree(sortedLeafIndices, leavesCount) {
        const depth = Math.ceil(Math.log2(leavesCount));
        const unevenLayers = [];
        for (let index = 0; index < depth; index++) {
            const unevenLayer = leavesCount % 2 !== 0;
            if (unevenLayer) {
                unevenLayers.push({ index, leavesCount });
            }
            leavesCount = Math.ceil(leavesCount / 2);
        }
        const proofIndices = [];
        let layerNodes = sortedLeafIndices;
        for (let layerIndex = 0; layerIndex < depth; layerIndex++) {
            const siblingIndices = layerNodes.map((index) => {
                if (index % 2 === 0) {
                    return index + 1;
                }
                return index - 1;
            });
            let proofNodeIndices = siblingIndices.filter((index) => !layerNodes.includes(index));
            const unevenLayer = unevenLayers.find(({ index }) => index === layerIndex);
            if (unevenLayer && layerNodes.includes(unevenLayer.leavesCount - 1)) {
                proofNodeIndices = proofNodeIndices.slice(0, -1);
            }
            proofIndices.push(proofNodeIndices);
            layerNodes = [...new Set(layerNodes.map((index) => {
                    if (index % 2 === 0) {
                        return index / 2;
                    }
                    if (index % 2 === 0) {
                        return (index + 1) / 2;
                    }
                    return (index - 1) / 2;
                }))];
        }
        return proofIndices;
    }
    
    // Returns the multiproof for given tree indices
    getMultiProof(tree, indices) {
        if (!this.complete) {
            console.warn('Warning: For correct multiProofs it\'s strongly recommended to set complete: true');
        }
        if (!indices) {
            indices = tree;
            tree = this.getLayersFlat();
        }
        const isUneven = this.isUnevenTree();
        if (isUneven) {
            if (indices.every(Number.isInteger)) {
                return this.getMultiProofForUnevenTree(indices);
            }
        }
        if (!indices.every(Number.isInteger)) {
            let els = indices;
            if (this.sortPairs) {
                els = els.sort(Buffer.compare);
            }
            let ids = els.map((el) => this.bufferIndexOf(this.leaves, el, this.sortLeaves)).sort((a, b) => a === b ? 0 : a > b ? 1 : -1);
            if (!ids.every((idx) => idx !== -1)) {
                throw new Error('Element does not exist in Merkle tree');
            }
            const hashes = [];
            const proof = [];
            let nextIds = [];
            for (let i = 0; i < this.layers.length; i++) {
                const layer = this.layers[i];
                for (let j = 0; j < ids.length; j++) {
                    const idx = ids[j];
                    const pairElement = this.getPairNode(layer, idx);
                    hashes.push(layer[idx]);
                    if (pairElement) {
                        proof.push(pairElement);
                    }
                    nextIds.push((idx / 2) | 0);
                }
                ids = nextIds.filter((value, i, self) => self.indexOf(value) === i);
                nextIds = [];
            }
            return proof.filter((value) => !hashes.includes(value));
        }
        return this.getProofIndices(indices, Math.log2((tree.length / 2) | 0)).map(index => tree[index]);
    }

    getMultiProofForUnevenTree(tree, indices) {
        if (!indices) {
            indices = tree;
            tree = this.getLayers();
        }
        let proofHashes = [];
        let currentLayerIndices = indices;
        for (const treeLayer of tree) {
            const siblings = [];
            for (const index of currentLayerIndices) {
                if (index % 2 === 0) {
                    const idx = index + 1;
                    if (!currentLayerIndices.includes(idx)) {
                        if (treeLayer[idx]) {
                            siblings.push(treeLayer[idx]);
                            continue;
                        }
                    }
                }
                const idx = index - 1;
                if (!currentLayerIndices.includes(idx)) {
                    if (treeLayer[idx]) {
                        siblings.push(treeLayer[idx]);
                        continue;
                    }
                }
            }
            proofHashes = proofHashes.concat(siblings);
            const uniqueIndices = new Set();
            for (const index of currentLayerIndices) {
                if (index % 2 === 0) {
                    uniqueIndices.add(index / 2);
                    continue;
                }
                if (index % 2 === 0) {
                    uniqueIndices.add((index + 1) / 2);
                    continue;
                }
                uniqueIndices.add((index - 1) / 2);
            }
            currentLayerIndices = Array.from(uniqueIndices);
        }
        return proofHashes;
    }
    
    // Returns the multiproof for given tree indices as hex strings
    getHexMultiProof(tree, indices) {
        return this.getMultiProof(tree, indices).map((x) => this.bufferToHex(x));
    }
    
    // Returns list of booleans where proofs should be used instead of hashing
    getProofFlags(leaves, proofs) {
        if (!Array.isArray(leaves) || leaves.length <= 0) {
            throw new Error('Invalid Inputs!');
        }
        let ids;
        if (leaves.every(Number.isInteger)) {
            ids = [...leaves].sort((a, b) => a === b ? 0 : a > b ? 1 : -1); // Indices where passed
        }
        else {
            ids = leaves.map((el) => this.bufferIndexOf(this.leaves, el, this.sortLeaves)).sort((a, b) => a === b ? 0 : a > b ? 1 : -1);
        }
        if (!ids.every((idx) => idx !== -1)) {
            throw new Error('Element does not exist in Merkle tree');
        }
        const _proofs = proofs.map(item => this.bufferify(item));
        const tested = [];
        const flags = [];
        for (let index = 0; index < this.layers.length; index++) {
            const layer = this.layers[index];
            ids = ids.reduce((ids, idx) => {
                const skipped = tested.includes(layer[idx]);
                if (!skipped) {
                    const pairElement = this.getPairNode(layer, idx);
                    const proofUsed = _proofs.includes(layer[idx]) || _proofs.includes(pairElement);
                    pairElement && flags.push(!proofUsed);
                    tested.push(layer[idx]);
                    tested.push(pairElement);
                }
                ids.push((idx / 2) | 0);
                return ids;
            }, []);
        }
        return flags;
    }

    // Returns true if the proof path (array of hashes) can connect the target node to the Merkle root
    verify(proof, targetNode, root) {
        let hash = this.bufferify(targetNode);
        root = this.bufferify(root);
        if (!Array.isArray(proof) ||
            !targetNode ||
            !root) {
            return false;
        }
        for (let i = 0; i < proof.length; i++) {
            const node = proof[i];
            let data = null;
            let isLeftNode = null;
            // case for when proof is hex values only
            if (typeof node === 'string') {
                data = this.bufferify(node);
                isLeftNode = true;
            }
            else if (Array.isArray(node)) {
                isLeftNode = (node[0] === 0);
                data = this.bufferify(node[1]);
            }
            else if (Buffer.isBuffer(node)) {
                data = node;
                isLeftNode = true;
            }
            else if (node instanceof Object) {
                data = this.bufferify(node.data);
                isLeftNode = (node.position === 'left');
            }
            else {
                throw new Error('Expected node to be of type string or object');
            }
            const buffers = [];
            if (this.isBitcoinTree) {
                buffers.push(reverse(hash));
                buffers[isLeftNode ? 'unshift' : 'push'](reverse(data));
                hash = this.hashFn(this.concatenator(buffers));
                hash = reverse(this.hashFn(hash));
            }
            else {
                if (this.sortPairs) {
                    if (Buffer.compare(hash, data) === -1) {
                        buffers.push(hash, data);
                        hash = this.hashFn(this.concatenator(buffers));
                    }
                    else {
                        buffers.push(data, hash);
                        hash = this.hashFn(this.concatenator(buffers));
                    }
                }
                else {
                    buffers.push(hash);
                    buffers[isLeftNode ? 'unshift' : 'push'](data);
                    hash = this.hashFn(this.concatenator(buffers));
                }
            }
        }
        return Buffer.compare(hash, root) === 0;
    }
    
    // Returns true if the multiproofs can connect the leaves to the Merkle root
    verifyMultiProof(root, proofIndices, proofLeaves, leavesCount, proof) {
        const isUneven = this.isUnevenTree();
        if (isUneven) {
            // TODO: combine these functions and simplify
            return this.verifyMultiProofForUnevenTree(root, proofIndices, proofLeaves, leavesCount, proof);
        }
        const depth = Math.ceil(Math.log2(leavesCount));
        root = this.bufferify(root);
        proofLeaves = proofLeaves.map(leaf => this.bufferify(leaf));
        proof = proof.map(leaf => this.bufferify(leaf));
        const tree = {};
        for (const [index, leaf] of this.zip(proofIndices, proofLeaves)) {
            tree[(2 ** depth) + index] = leaf;
        }
        for (const [index, proofitem] of this.zip(this.getProofIndices(proofIndices, depth), proof)) {
            tree[index] = proofitem;
        }
        let indexqueue = Object.keys(tree).map(value => +value).sort((a, b) => a - b);
        indexqueue = indexqueue.slice(0, indexqueue.length - 1);
        let i = 0;
        while (i < indexqueue.length) {
            const index = indexqueue[i];
            if (index >= 2 && ({}).hasOwnProperty.call(tree, index ^ 1)) {
                let pair = [tree[index - (index % 2)], tree[index - (index % 2) + 1]];
                if (this.sortPairs) {
                    pair = pair.sort(Buffer.compare);
                }
                const hash = pair[1] ? this.hashFn(this.concatenator(pair)) : pair[0];
                tree[(index / 2) | 0] = hash;
                indexqueue.push((index / 2) | 0);
            }
            i += 1;
        }
        return !proofIndices.length || (({}).hasOwnProperty.call(tree, 1) && tree[1].equals(root));
    }

    verifyMultiProofWithFlags(root, leaves, proofs, proofFlag) {
        root = this.bufferify(root);
        leaves = leaves.map(this.bufferify);
        proofs = proofs.map(this.bufferify);
        const leavesLen = leaves.length;
        const totalHashes = proofFlag.length;
        const hashes = [];
        let leafPos = 0;
        let hashPos = 0;
        let proofPos = 0;
        for (let i = 0; i < totalHashes; i++) {
            const bufA = proofFlag[i] ? (leafPos < leavesLen ? leaves[leafPos++] : hashes[hashPos++]) : proofs[proofPos++];
            const bufB = leafPos < leavesLen ? leaves[leafPos++] : hashes[hashPos++];
            const buffers = [bufA, bufB].sort(Buffer.compare);
            hashes[i] = this.hashFn(this.concatenator(buffers));
        }
        return Buffer.compare(hashes[totalHashes - 1], root) === 0;
    }
    verifyMultiProofForUnevenTree(root, indices, leaves, leavesCount, proof) {
        root = this.bufferify(root);
        leaves = leaves.map(leaf => this.bufferify(leaf));
        proof = proof.map(leaf => this.bufferify(leaf));
        const computedRoot = this.calculateRootForUnevenTree(indices, leaves, leavesCount, proof);
        return root.equals(computedRoot);
    }
    
    // Returns the tree depth (number of layers)
    getDepth() {
        return this.getLayers().length - 1;
    }
    
    // Returns the layers as nested objects instead of an array
    getLayersAsObject() {
        const layers = this.getLayers().map((layer) => layer.map((value) => this.bufferToHex(value, false)));
        const objs = [];
        for (let i = 0; i < layers.length; i++) {
            const arr = [];
            for (let j = 0; j < layers[i].length; j++) {
                const obj = { [layers[i][j]]: null };
                if (objs.length) {
                    obj[layers[i][j]] = {};
                    const a = objs.shift();
                    const akey = Object.keys(a)[0];
                    obj[layers[i][j]][akey] = a[akey];
                    if (objs.length) {
                        const b = objs.shift();
                        const bkey = Object.keys(b)[0];
                        obj[layers[i][j]][bkey] = b[bkey];
                    }
                }
                arr.push(obj);
            }
            objs.push(...arr);
        }
        return objs[0];
    }
    
    // Returns true if the proof path (array of hashes) can connect the target node to the Merkle root
    static verify(proof, targetNode, root, hashFn = SHA256, options = {}) {
        const tree = new MerkleTree([], hashFn, options);
        return tree.verify(proof, targetNode, root);
    }
    
    // Returns the multiproof for given tree indices
    static getMultiProof(tree, indices) {
        const t = new MerkleTree([]);
        return t.getMultiProof(tree, indices);
    }
    
    // Resets the tree by clearing the leaves and layers
    resetTree() {
        this.leaves = [];
        this.layers = [];
    }
    
    // Returns the node at the index for given layer
    getPairNode(layer, idx) {
        const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
        if (pairIdx < layer.length) {
            return layer[pairIdx];
        }
        else {
            return null;
        }
    }
    
    // Returns a visual representation of the merkle tree as a string
    toTreeString() {
        const obj = this.getLayersAsObject();
        return treeify.asTree(obj, true);
    }
    
    // Returns a visual representation of the merkle tree as a string
    toString() {
        return this.toTreeString();
    }
    isUnevenTree(treeLayers) {
        const depth = treeLayers?.length || this.getDepth();
        return !this.isPowOf2(depth);
    }
    isPowOf2(v) {
        return v && !(v & (v - 1));
    }
    calculateRootForUnevenTree(leafIndices, leafHashes, totalLeavesCount, proofHashes) {
        const leafTuples = this.zip(leafIndices, leafHashes).sort(([indexA], [indexB]) => indexA - indexB);
        const leafTupleIndices = leafTuples.map(([index]) => index);
        const proofIndices = this.getProofIndicesForUnevenTree(leafTupleIndices, totalLeavesCount);
        let nextSliceStart = 0;
        const proofTuplesByLayers = [];
        for (let i = 0; i < proofIndices.length; i++) {
            const indices = proofIndices[i];
            const sliceStart = nextSliceStart;
            nextSliceStart += indices.length;
            proofTuplesByLayers[i] = this.zip(indices, proofHashes.slice(sliceStart, nextSliceStart));
        }
        const tree = [leafTuples];
        for (let layerIndex = 0; layerIndex < proofTuplesByLayers.length; layerIndex++) {
            const currentLayer = proofTuplesByLayers[layerIndex].concat(tree[layerIndex]).sort(([indexA], [indexB]) => indexA - indexB)
                .map(([, hash]) => hash);
            const s = tree[layerIndex].map(([layerIndex]) => layerIndex);
            const parentIndices = [...new Set(s.map((index) => {
                    if (index % 2 === 0) {
                        return index / 2;
                    }
                    if (index % 2 === 0) {
                        return (index + 1) / 2;
                    }
                    return (index - 1) / 2;
                }))];
            const parentLayer = [];
            for (let i = 0; i < parentIndices.length; i++) {
                const parentNodeTreeIndex = parentIndices[i];
                const bufA = currentLayer[i * 2];
                const bufB = currentLayer[i * 2 + 1];
                const hash = bufB ? this.hashFn(this.concatenator([bufA, bufB])) : bufA;
                parentLayer.push([parentNodeTreeIndex, hash]);
            }
            tree.push(parentLayer);
        }
        return tree[tree.length - 1][0][1];
    }
}
if (typeof window !== 'undefined') {
    ;
    window.MerkleTree = MerkleTree;
}
export default MerkleTree;