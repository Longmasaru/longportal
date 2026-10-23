/** 組織図に載せる社員 1 人(今日の主所属つき)。主所属がない人は departmentId・locationId が null。 */
export type OrgMember = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  /** 姓と名(配置図で、名字だけの札を社員に当てるのに使う)。 */
  familyName: string;
  givenName: string | null;
  nameKana: string | null;
  positionName: string | null;
  isManagement: boolean;
  /** 役職の序列(大きいほど上位)。役職なしは null。 */
  positionRank: number | null;
  positionSortOrder: number | null;
  hiredOn: string;
  departmentId: string | null;
  locationId: string | null;
  locationName: string | null;
};

export type OrgUnit = { id: string; code: string; name: string; sortOrder: number };

/** 部署の箱 1 つ。所属のない人の箱は department が null。 */
export type OrgBox = {
  department: OrgUnit | null;
  /** 管理職(役職の is_management)。箱の上の段に出す。 */
  leaders: OrgMember[];
  members: OrgMember[];
  count: number;
};
