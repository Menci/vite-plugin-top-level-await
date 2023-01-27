import { v5 } from "uuid";

export class RandomIdentifierGenerator {
  private state: string;

  constructor(seed: string) {
    const INITIAL_NAMESPACE = "7976c25e-8279-4241-9a9a-e1831e9feab1";
    this.state = v5(seed, INITIAL_NAMESPACE);
  }

  generate() {
    this.state = v5(this.state, this.state);
    return "var_" + this.state.split("-").join("_");
  }
}
