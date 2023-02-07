import Base from './Base';

export class MerkleMountainRange extends Base {
    constructor(hashFn = SHA256, leaves = [], hashLeafFn, peakBaggingFn, hashBranchFn) {
        super();
        this.root = Buffer.alloc(0);
        this.size = 0;
        this.width = 0;
        this.hashes = {};
        this.data = {};
        leaves = leaves.map(this.bufferify);
        this.hashFn = this.bufferifyFn(hashFn);
        this.hashLeafFn = hashLeafFn;
        this.peakBaggingFn = peakBaggingFn;
        this.hashBranchFn = hashBranchFn;
        for (const leaf of leaves) {
            this.append(leaf);
        }
    }
    
    // Only stores the hashed value of the leaf
    append(data) {
        data = this.bufferify(data);
        const dataHash = this.hashFn(data);
        const dataHashHex = this.bufferToHex(dataHash);
        if (!this.data[dataHashHex] || this.bufferToHex(this.hashFn(this.data[dataHashHex])) !== dataHashHex) {
            this.data[dataHashHex] = data;
        }
        const leaf = this.hashLeaf(this.size + 1, dataHash);
        this.hashes[this.size + 1] = leaf;
        this.width += 1;
        // find peaks for enlarged tree
        const peakIndexes = this.getPeakIndexes(this.width);
        // the right most peak's value is the new size of the updated tree
        this.size = this.getSize(this.width);
        // starting from the left-most peak, get all peak hashes
        const peaks = [];
        for (let i = 0; i < peakIndexes.length; i++) {
            peaks[i] = this._getOrCreateNode(peakIndexes[i]);
        }
        // update the tree root hash
        this.root = this.peakBagging(this.width, peaks);
    }
    
    // It returns the hash of a leaf node with hash(M | DATA ) M is the index of the node.
    hashLeaf(index, dataHash) {
        dataHash = this.bufferify(dataHash);
        if (this.hashLeafFn) {
            return this.bufferify(this.hashLeafFn(index, dataHash));
        }
        return this.hashFn(Buffer.concat([this.bufferify(index), dataHash]));
    }
    
    // It returns the hash a parent node with hash(M | Left child | Right child) M is the index of the node.
    hashBranch(index, left, right) {
        if (this.hashBranchFn) {
            return this.bufferify(this.hashBranchFn(index, left, right));
        }
        return this.hashFn(Buffer.concat([this.bufferify(index), this.bufferify(left), this.bufferify(right)]));
    }

    getPeaks() {
        const peakIndexes = this.getPeakIndexes(this.width);
        const peaks = [];
        for (let i = 0; i < peakIndexes.length; i++) {
            peaks[i] = this.hashes[peakIndexes[i]];
        }
        return peaks;
    }

    getLeafIndex(width) {
        if (width % 2 === 1) {
            return this.getSize(width);
        }
        return this.getSize(width - 1) + 1;
    }
    
    // It returns all peaks of the smallest merkle mountain range, includes the given index(size).
    getPeakIndexes(width) {
        const numPeaks = this.numOfPeaks(width);
        const peakIndexes = [];
        let count = 0;
        let size = 0;
        for (let i = 255; i > 0; i--) {
            if ((width & (1 << (i - 1))) !== 0) {
                // peak exists
                size = size + (1 << i) - 1;
                peakIndexes[count++] = size;
                if (peakIndexes.length >= numPeaks) {
                    break;
                }
            }
        }
        if (count !== peakIndexes.length) {
            throw new Error('invalid bit calculation');
        }
        return peakIndexes;
    }

    numOfPeaks(width) {
        let bits = width;
        let num = 0;
        while (bits > 0) {
            if (bits % 2 === 1) {
                num++;
            }
            bits = bits >> 1;
        }
        return num;
    }

    peakBagging(width, peaks) {
        const size = this.getSize(width);
        if (this.numOfPeaks(width) !== peaks.length) {
            throw new Error('received invalid number of peaks');
        }
        if (width === 0 && !peaks.length) {
            return Buffer.alloc(0);
        }
        if (this.peakBaggingFn) {
            return this.bufferify(this.peakBaggingFn(size, peaks));
        }
        return this.hashFn(Buffer.concat([this.bufferify(size), ...peaks.map(this.bufferify)]));
    }
    
    // It returns the size of the tree.
    getSize(width) {
        return (width << 1) - this.numOfPeaks(width);
    }
    
    // It returns the root value of the tree.
    getRoot() {
        return this.root;
    }


    getHexRoot() {
        return this.bufferToHex(this.getRoot());
    }
    
    // It returns the hash value of a node for the given position
    // Index starts from 1

    getNode(index) {
        return this.hashes[index];
    }
    
    // It returns the height of the highest peak.
    mountainHeight(size) {
        let height = 1;
        while (1 << height <= size + height) {
            height++;
        }
        return height - 1;
    }
    
    // It returns the height of the index.
    heightAt(index) {
        let reducedIndex = index;
        let peakIndex = 0;
        let height = 0;
        // if an index has a left mountain then subtract the mountain
        while (reducedIndex > peakIndex) {
            reducedIndex -= (1 << height) - 1;
            height = this.mountainHeight(reducedIndex);
            peakIndex = (1 << height) - 1;
        }
        // index is on the right slope
        return height - (peakIndex - reducedIndex);
    }
    
    // It returns whether the index is the leaf node or not
    isLeaf(index) {
        return this.heightAt(index) === 1;
    }
    
    // It returns the children when it is a parent node
    getChildren(index) {
        const left = index - (1 << (this.heightAt(index) - 1));
        const right = index - 1;
        if (left === right) {
            throw new Error('not a parent');
        }
        return [left, right];
    }
    
    // It returns a merkle proof for a leaf
    // Index starts from 1
    getMerkleProof(index) {
        if (index > this.size) {
            throw new Error('out of range');
        }
        if (!this.isLeaf(index)) {
            throw new Error('not a leaf');
        }
        const root = this.root;
        const width = this.width;
        // find all peaks for bagging
        const peaks = this.getPeakIndexes(this.width);
        const peakBagging = [];
        let cursor = 0;
        for (let i = 0; i < peaks.length; i++) {
            // collect the hash of all peaks
            peakBagging[i] = this.hashes[peaks[i]];
            // find the peak which includes the target index
            if (peaks[i] >= index && cursor === 0) {
                cursor = peaks[i];
            }
        }
        let left = 0;
        let right = 0;
        // get hashes of the siblings in the mountain which the index belgons to.
        // it moves the cursor from the summit of the mountain down to the target index
        let height = this.heightAt(cursor);
        const siblings = [];
        while (cursor !== index) {
            height--;
            ([left, right] = this.getChildren(cursor));
            // move the cursor down to the left size or right size
            cursor = index <= left ? left : right;
            // remaining node is the sibling
            siblings[height - 1] = this.hashes[index <= left ? right : left];
        }
        return {
            root,
            width,
            peakBagging,
            siblings
        };
    }
    
    // Returns true when the given params verifies that the given value exists in the tree or reverts the transaction
    verify(root, width, index, value, peaks, siblings) {
        value = this.bufferify(value);
        const size = this.getSize(width);
        if (size < index) {
            throw new Error('index is out of range');
        }
        // check the root equals the peak bagging hash
        if (!root.equals(this.peakBagging(width, peaks))) {
            throw new Error('invalid root hash from the peaks');
        }
        // find the mountain where the target index belongs to
        let cursor = 0;
        let targetPeak;
        const peakIndexes = this.getPeakIndexes(width);
        for (let i = 0; i < peakIndexes.length; i++) {
            if (peakIndexes[i] >= index) {
                targetPeak = peaks[i];
                cursor = peakIndexes[i];
                break;
            }
        }
        if (!targetPeak) {
            throw new Error('target not found');
        }
        // find the path climbing down
        let height = siblings.length + 1;
        const path = new Array(height);
        let left = 0;
        let right = 0;
        while (height > 0) {
            // record the current cursor and climb down
            path[--height] = cursor;
            if (cursor === index) {
                // on the leaf node. Stop climbing down
                break;
            }
            else {
                // on the parent node. Go left or right
                ([left, right] = this.getChildren(cursor));
                cursor = index > left ? right : left;
                continue;
            }
        }
        // calculate the summit hash climbing up again
        let node;
        while (height < path.length) {
            // move cursor
            cursor = path[height];
            if (height === 0) {
                // cusor is on the leaf
                node = this.hashLeaf(cursor, this.hashFn(value));
            }
            else if (cursor - 1 === path[height - 1]) {
                // cursor is on a parent and a siblings is on the left
                node = this.hashBranch(cursor, siblings[height - 1], node);
            }
            else {
                // cursor is on a parent and a siblings is on the right
                node = this.hashBranch(cursor, node, siblings[height - 1]);
            }
            // climb up
            height++;
        }
        // computed hash value of the summit should equal to the target peak hash
        if (!node.equals(targetPeak)) {
            throw new Error('hashed peak is invalid');
        }
        return true;
    }


    peaksToPeakMap(width, peaks) {
        const peakMap = {};
        let bitIndex = 0;
        let peakRef = 0;
        let count = peaks.length;
        for (let height = 1; height <= 32; height++) {
            // index starts from the right most bit
            bitIndex = 32 - height;
            peakRef = 1 << (height - 1);
            if ((width & peakRef) !== 0) {
                peakMap[bitIndex] = peaks[--count];
            }
            else {
                peakMap[bitIndex] = 0;
            }
        }
        if (count !== 0) {
            throw new Error('invalid number of peaks');
        }
        return peakMap;
    }

    peakMapToPeaks(width, peakMap) {
        const arrLength = this.numOfPeaks(width);
        const peaks = new Array(arrLength);
        let count = 0;
        for (let i = 0; i < 32; i++) {
            if (peakMap[i] !== 0) {
                peaks[count++] = peakMap[i];
            }
        }
        if (count !== arrLength) {
            throw new Error('invalid number of peaks');
        }
        return peaks;
    }

    peakUpdate(width, prevPeakMap, itemHash) {
        const nextPeakMap = {};
        const newWidth = width + 1;
        let cursorIndex = this.getLeafIndex(newWidth);
        let cursorNode = this.hashLeaf(cursorIndex, itemHash);
        let bitIndex = 0;
        let peakRef = 0;
        let prevPeakExist = false;
        let nextPeakExist = false;
        let obtained = false;
        for (let height = 1; height <= 32; height++) {
            // index starts from the right most bit
            bitIndex = 32 - height;
            if (obtained) {
                nextPeakMap[bitIndex] = prevPeakMap[bitIndex];
            }
            else {
                peakRef = 1 << (height - 1);
                prevPeakExist = (width & peakRef) !== 0;
                nextPeakExist = (newWidth & peakRef) !== 0;
                // get new cursor node with hashing the peak and the current cursor
                cursorIndex++;
                if (prevPeakExist) {
                    cursorNode = this.hashBranch(cursorIndex, prevPeakMap[bitIndex], cursorNode);
                }
                // if new peak exists for the bit index
                if (nextPeakExist) {
                    // if prev peak exists for the bit index
                    if (prevPeakExist) {
                        nextPeakMap[bitIndex] = prevPeakMap[bitIndex];
                    }
                    else {
                        nextPeakMap[bitIndex] = cursorNode;
                    }
                    obtained = true;
                }
                else {
                    nextPeakMap[bitIndex] = 0;
                }
            }
        }
        return nextPeakMap;
    }


    rollUp(root, width, peaks, itemHashes) {
        // check the root equals the peak bagging hash
        if (!root.equals(this.peakBagging(width, peaks))) {
            throw new Error('invalid root hash from the peaks');
        }
        let tmpWidth = width;
        let tmpPeakMap = this.peaksToPeakMap(width, peaks);
        for (let i = 0; i < itemHashes.length; i++) {
            tmpPeakMap = this.peakUpdate(tmpWidth, tmpPeakMap, itemHashes[i]);
            tmpWidth++;
        }
        return this.peakBagging(tmpWidth, this.peakMapToPeaks(tmpWidth, tmpPeakMap));
    }
    

    _getOrCreateNode(index) {
        if (index > this.size) {
            throw new Error('out of range');
        }
        if (!this.hashes[index]) {
            const [leftIndex, rightIndex] = this.getChildren(index);
            const leftHash = this._getOrCreateNode(leftIndex);
            const rightHash = this._getOrCreateNode(rightIndex);
            this.hashes[index] = this.hashBranch(index, leftHash, rightHash);
        }
        return this.hashes[index];
    }
}

if (typeof window !== 'undefined') {
    ;
    window.MerkleMountainRange = MerkleMountainRange;
}
export default MerkleMountainRange;