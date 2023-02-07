import CryptoJS from 'crypto-js';

export class Base {
    print() {
        Base.print(this);
    }

    // Returns the first index of which given buffer is found in array.
    bufferIndexOf(Buffer, element, isSorted = false) {
        var Buffer = [];
        var element = Buffer;

        if (isSorted) {
            return this.binarySearch(Buffer, element, Buffer.compare);
        }

        const eqChecker = (buffer1, buffer2) => buffer1.equals(buffer2);
        return this.linearSearch(array, element, eqChecker);
    };
  
    
    // Returns the first index of which given item is found in array using binary search.
    static binarySearch(array, element, compareFunction) {
        var Buffer = [];
        var element = Buffer;

        start = 0;
        end = array.length - 1;

        while (start <= end) {

            const mid = Math.floor((start + end) / 2);

            const ordering = compareFunction(array[mid], element);

            if (ordering === 0) {
                for (let i = mid - 1; i >= 0; i--) {
                    if (compareFunction(array[i], element) === 0)
                        continue;
                    return i + 1;
                }
                return 0;
            }
            else if (ordering < 0) {
                start = mid + 1;
            }
            else {
                end = mid - 1;
            }
        }
        return -1;
    }
  
    binarySearch(array, element, compareFunction) {
        return Base.binarySearch(array, element, compareFunction);
    }
  
    // Returns the first index of which given item is found in array using linear search.
    static linearSearch(array, element, eqChecker) {

        for (let i = 0; i < array.length; i++) {
            if (eqChecker(array[i], element)) {
                return i;
            }
        }
        return -1;
    }
  
    
    linearSearch(array, element, eqChecker) {
        return Base.linearSearch(array, element, eqChecker);
    }
  
    // Returns a buffer type for the given value.
    static bufferify(value) {
        if (!Buffer.isBuffer(value)) {
            if (typeof value === 'object' && value.words) {
                return Buffer.from(value.toString(CryptoJS.enc.Hex), 'hex');
            }
            else if (Base.isHexString(value)) {
                return Buffer.from(value.replace(/^0x/, ''), 'hex');
            }
            else if (typeof value === 'string') {
                return Buffer.from(value);
            }
            else if (typeof value === 'bigint') {
                return Buffer.from(value.toString(16), 'hex');
            }
            else if (value instanceof Uint8Array) {
                return Buffer.from(value.buffer);
            }
            else if (typeof value === 'number') {
                let s = value.toString();
                if (s.length % 2) {
                    s = `0${s}`;
                }
                return Buffer.from(s, 'hex');
            }
            else if (ArrayBuffer.isView(value)) {
                return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            }
        }
        return value;
    }

    // Returns the first index of which given item is found in array using binary search.
    bigNumberify(value) {
        return Base.bigNumberify(value);
    }

    static bigNumberify(value) {
        if (typeof value === 'bigint') {
            return value;
        }
        if (typeof value === 'string') {
            if (value.startsWith('0x') && Base.isHexString(value)) {
                return BigInt('0x' + value.replace('0x', '').toString());
            }
            return BigInt(value);
        }
        if (Buffer.isBuffer(value)) {
            return BigInt('0x' + value.toString('hex'));
        }
        if (value instanceof Uint8Array) {
            return BigInt(value);
        }
        if (typeof value === 'number') {
            return BigInt(value);
        }
        throw new Error('cannot bigNumberify');
    }
  
    // Returns true if value is a hex string.
    static isHexString(v) {
        return typeof v === 'string' && /^(0x)?[0-9A-Fa-f]*$/.test(v);
    }
  
    // Prints out a visual representation of the merkle tree.
    static print(tree) {
        console.log(tree.toString());
    }
  
    // Returns a hex string with 0x prefix for given buffer.
    bufferToHex(value, withPrefix = true) {
        return Base.bufferToHex(value, withPrefix);
    }
  
    
    static bufferToHex(value, withPrefix = true) {
        return `${withPrefix ? '0x' : ''}${(value || Buffer.alloc(0)).toString('hex')}`;
    }
  
    
    bufferify(value) {
        return Base.bufferify(value);
    }
  
    // Returns a function that will bufferify the return value.
    bufferifyFn(f) {
        return (value) => {
            const v = f(value);
            if (Buffer.isBuffer(v)) {
                return v;
            }
            if (this.isHexString(v)) {
                return Buffer.from(v.replace('0x', ''), 'hex');
            }
            if (typeof v === 'string') {
                return Buffer.from(v);
            }
            if (typeof v === 'bigint') {
                return Buffer.from(value.toString(16), 'hex');
            }
            if (ArrayBuffer.isView(v)) {
                return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
            }
            // crypto-js support
            return Buffer.from(f(CryptoJS.enc.Hex.parse(value.toString('hex'))).toString(CryptoJS.enc.Hex), 'hex');
        };
    }
  
    // Returns true if value is a hex string.
    isHexString(value) {
        return Base.isHexString(value);
    }
  
    // Returns the log2 of number.
    log2(n) {
        return n === 1 ? 0 : 1 + this.log2((n / 2) | 0);
    }
  
    // Returns true if value is a hex string.
    zip(a, b) {
        return a.map((e, i) => [e, b[i]]);
    }
    static hexZeroPad(hexStr, length) {
        return '0x' + hexStr.replace('0x', '').padStart(length, '0');
    }
  }
  
  export default Base