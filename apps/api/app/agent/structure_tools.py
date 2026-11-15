"""Agent-callable coordinate tools for verified structures (8C.1). Agent orchestration and viewer handoff are 8C.2."""
from langchain_core.tools import tool

from app.schemas.structure_analysis import ResidueSelector
from app.structures.service import StructureService, resolve


def build_structure_tools(service: StructureService | None = None):
    structures = service or StructureService()

    @tool
    def find_verified_structure(drug_name: str, target: str) -> dict:
        """Find the verified cached experimental structure for a drug and its target, with deposition metadata, species/construct, entities, coordinate hash and scope. Returns status unavailable when no verified structure exists for this pair; never substitutes a related structure."""
        pdb_id = resolve(drug_name, target)
        if pdb_id is None:
            return {'status': 'unavailable', 'reason': 'unknown_structure',
                'detail': 'No verified cached drug–target structure exists for this pair. Structural measurements are unavailable; research and simulation are unaffected.'}
        return structures.metadata(pdb_id).model_dump(mode='json', exclude_none=True)

    @tool
    def list_interface_contacts(pdb_id: str, limit: int = 10) -> dict:
        """List the closest drug–target residue pairs (heavy atoms within 4 Å) in a verified structure, with author chain/residue/atom identifiers and distances in Å, closest first. Geometry only: proximity does not establish hydrogen bonds, energy, affinity or kinetic rates."""
        return structures.interface(pdb_id, limit).model_dump(mode='json', exclude_none=True)

    @tool
    def measure_residue_distance(pdb_id: str, residue: ResidueSelector, counterpart: ResidueSelector | None = None, limit: int = 5) -> dict:
        """Measure the minimum heavy-atom distance between one residue and a named residue of the opposite binding partner, or, without a counterpart, list its nearest binding-partner residues. Uses author identifiers. Unresolved or absent residues, same-partner pairs and pairs in different crystal copies return unavailable with the reason."""
        return structures.distance(pdb_id, residue, counterpart, limit).model_dump(mode='json', exclude_none=True)

    return [find_verified_structure, list_interface_contacts, measure_residue_distance]
