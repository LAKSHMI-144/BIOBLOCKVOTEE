import hashlib
import json
import time

class Block:
    def __init__(self, index, voter_hash, candidate, prev_hash):
        self.index = index
        self.timestamp = str(time.time())
        self.voter_hash = voter_hash
        self.candidate = candidate
        self.prev_hash = prev_hash
        self.hash = self.calculate_hash()

    def calculate_hash(self):
        content = json.dumps({
            "index": self.index,
            "timestamp": self.timestamp,
            "voter_hash": self.voter_hash,
            "candidate": self.candidate,
            "prev_hash": self.prev_hash
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()

class Blockchain:
    def __init__(self):
        self.chain = []
        genesis = Block(0, "0", "GENESIS_BLOCK", "0")
        self.chain.append(genesis)

    def add_vote(self, voter_id, candidate):
        voter_hash = hashlib.sha256(voter_id.encode()).hexdigest()
        last = self.chain[-1]
        new_block = Block(len(self.chain), voter_hash, candidate, last.hash)
        self.chain.append(new_block)
        return {
            "block_index": new_block.index,
            "block_hash": new_block.hash,
            "voter_hash": voter_hash,
            "candidate": candidate
        }

    def is_valid(self):
        for i in range(1, len(self.chain)):
            curr = self.chain[i]
            prev = self.chain[i - 1]
            if curr.hash != curr.calculate_hash():
                return False
            if curr.prev_hash != prev.hash:
                return False
        return True

    def get_chain_data(self):
        return [{
            "index": b.index,
            "hash": b.hash[:25] + "...",
            "voter_hash": b.voter_hash[:20] + "...",
            "candidate": b.candidate,
            "timestamp": b.timestamp
        } for b in self.chain]

voting_blockchain = Blockchain()
