import unittest

from python_ai.blockchain import Blockchain


class BlockchainIntegrityTests(unittest.TestCase):
    def test_genesis_and_vote_chain_are_valid(self):
        chain = Blockchain()
        self.assertTrue(chain.is_valid())
        chain.add_vote("VOTER-1", "CANDIDATE-1")
        self.assertTrue(chain.is_valid())

    def test_verification_does_not_change_ledger(self):
        chain = Blockchain()
        chain.add_vote("VOTER-1", "CANDIDATE-1")
        before = [block.__dict__.copy() for block in chain.chain]

        self.assertTrue(chain.is_valid())
        self.assertTrue(chain.is_valid())

        self.assertEqual(before, [block.__dict__ for block in chain.chain])

    def test_genesis_tampering_is_detected(self):
        chain = Blockchain()
        chain.chain[0].voter_hash = "tampered"

        self.assertFalse(chain.is_valid())

    def test_rewritten_genesis_payload_is_detected(self):
        chain = Blockchain()
        chain.chain[0].candidate = "REWRITTEN"
        chain.chain[0].hash = chain.chain[0].calculate_hash()

        self.assertFalse(chain.is_valid())

    def test_broken_link_and_index_are_detected(self):
        chain = Blockchain()
        chain.add_vote("VOTER-1", "CANDIDATE-1")
        chain.chain[1].index = 3

        self.assertFalse(chain.is_valid())

    def test_empty_chain_is_invalid(self):
        chain = Blockchain()
        chain.chain.clear()

        self.assertFalse(chain.is_valid())


if __name__ == "__main__":
    unittest.main()
